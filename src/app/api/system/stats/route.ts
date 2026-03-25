import { NextResponse } from 'next/server';
import { execAsync } from '@/lib/exec';

interface StaticStats {
  hostname: string;
  kernel: string;
  arch: string;
  cpuModel: string;
  osVersion: string;
  totalMB: number;
}

interface DiskStats {
  total: string;
  used: string;
  free: string;
  percent: string;
}

interface SemiStaticStats {
  disk: DiskStats;
  battery: string;
  swap: string;
}

// Simple in-memory cache
let staticCache: StaticStats | null = null;
let semiStaticCache: { data: SemiStaticStats, timestamp: number } | null = null;
const SEMI_STATIC_TTL = 30000; // 30 seconds

export async function GET() {
  try {
    const now = Date.now();

    // 1. Static Stats (Cache forever/per process)
    if (!staticCache) {
      const [hostname, kernel, arch, cpuModel, swRaw] = await Promise.all([
        execAsync("hostname").then(r => r.stdout.trim()),
        execAsync("uname -sr").then(r => r.stdout.trim()),
        execAsync("uname -m").then(r => r.stdout.trim()),
        execAsync("sysctl -n machdep.cpu.brand_string").then(r => r.stdout.trim()),
        execAsync("sw_vers").then(r => r.stdout),
      ]);

      const productName = swRaw.match(/ProductName:\s+(.+)/)?.[1] || '';
      const productVersion = swRaw.match(/ProductVersion:\s+(.+)/)?.[1] || '';
      const osVersion = `${productName} ${productVersion}`.trim();

      const { stdout: physMemRaw } = await execAsync("sysctl -n hw.memsize");
      const totalBytes = parseInt(physMemRaw.trim());
      const totalMB = Math.round(totalBytes / 1024 / 1024);

      staticCache = {
        hostname,
        kernel,
        arch,
        cpuModel,
        osVersion,
        totalMB
      };
    }

    // 2. Semi-Static Stats (Cache for 30s)
    if (!semiStaticCache || (now - semiStaticCache.timestamp > SEMI_STATIC_TTL)) {
      const [diskResult, battResult, swapResult] = await Promise.allSettled([
        execAsync("df -H /"),
        execAsync("pmset -g batt"),
        execAsync("sysctl -n vm.swapusage")
      ]);

      let disk = { total: '0 GB', used: '0 GB', free: '0 GB', percent: '0%' };
      if (diskResult.status === 'fulfilled') {
        const lines = diskResult.value.stdout.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          const totalStr = parts[1];
          const availStr = parts[3];
          const formatUnit = (s: string) => s.replace('Gi', ' GB').replace('G', ' GB').replace('Mi', ' MB').replace('M', ' MB');
          const totalVal = parseFloat(totalStr);
          const availVal = parseFloat(availStr);
          const usedVal = Math.max(0, totalVal - availVal);
          const calcPercent = totalVal > 0 ? Math.round((usedVal / totalVal) * 100) : 0;
          disk = {
            total: formatUnit(totalStr),
            used: usedVal.toFixed(1) + ' GB',
            free: formatUnit(availStr),
            percent: calcPercent + '%'
          };
        }
      }

      let battery = 'Unknown';
      if (battResult.status === 'fulfilled') {
        const match = battResult.value.stdout.match(/(\d+)%/);
        if (match) {
          battery = `${match[1]}%`;
          if (battResult.value.stdout.includes('discharging')) battery += ' (discharging)';
          else if (battResult.value.stdout.includes('charging')) battery += ' (charging)';
          else battery += ' (ac)';
        }
      }

      let swap = 'Unknown';
      if (swapResult.status === 'fulfilled') {
        const swapMatch = swapResult.value.stdout.match(/total = (\d+\.\d+M).*used = (\d+\.\d+M).*free = (\d+\.\d+M)/);
        if (swapMatch) {
          swap = `${swapMatch[2]} / ${swapMatch[1]}`;
        }
      }

      semiStaticCache = {
        timestamp: now,
        data: { disk, battery, swap }
      };
    }

    // 3. Dynamic Stats (Fresh every time)
    // Consolidate 'top' calls into one if possible, or use faster alternatives
    const [topResult, vmStatResult, pageSizeResult, netstatResult, uptimeResult, loadResult, pressureResult] = await Promise.allSettled([
      execAsync("top -l 1 -n 0 -s 0 | grep -E 'CPU usage|Networks:'"),
      execAsync("vm_stat"),
      execAsync("sysctl -n vm.pagesize"),
      execAsync("netstat -ib | awk 'NR>1 && $1 != \"lo0\" && $1 !~ /\\*/ {in_b+=$7; out_b+=$10} END {print in_b \" \" out_b}'"),
      execAsync("uptime"),
      execAsync("sysctl -n vm.loadavg"),
      execAsync("sysctl -n kern.memorystatus_level")
    ]);

    let cpu = null;
    let network = 'Unknown';
    if (topResult.status === 'fulfilled') {
      const topLines = topResult.value.stdout.split('\n');
      const cpuLine = topLines.find(l => l.includes('CPU usage'));
      const netLine = topLines.find(l => l.includes('Networks:'));

      if (cpuLine) {
        const cpuMatch = cpuLine.match(/(\d+\.\d+)% user, (\d+\.\d+)% sys, (\d+\.\d+)% idle/);
        if (cpuMatch) {
          cpu = {
            user: parseFloat(cpuMatch[1]),
            sys: parseFloat(cpuMatch[2]),
            idle: parseFloat(cpuMatch[3]),
          };
        }
      }
      if (netLine) {
        network = netLine.replace('Networks:', '').trim();
      }
    }

    let memory = { freeMB: 0, usedMB: 0, totalMB: staticCache.totalMB };
    if (vmStatResult.status === 'fulfilled' && pageSizeResult.status === 'fulfilled') {
      const pageSize = parseInt(pageSizeResult.value.stdout.trim());
      const vmStatLines = vmStatResult.value.stdout.split('\n');
      const getPages = (key: string) => {
        const line = vmStatLines.find(l => l.includes(key));
        const match = line?.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };
      const freePages = getPages('Pages free');
      const inactivePages = getPages('Pages inactive');
      const speculativePages = getPages('Pages speculative');
      const availableMB = Math.round((freePages + inactivePages + speculativePages) * pageSize / 1024 / 1024);
      memory.freeMB = availableMB;
      memory.usedMB = Math.max(0, staticCache.totalMB - availableMB);
    }

    let netBytes = { in: 0, out: 0 };
    if (netstatResult.status === 'fulfilled') {
      const [inB, outB] = netstatResult.value.stdout.trim().split(' ').map(Number);
      if (!isNaN(inB) && !isNaN(outB)) netBytes = { in: inB, out: outB };
    }

    const uptime = uptimeResult.status === 'fulfilled' ? uptimeResult.value.stdout.trim() : 'Unknown';
    const loadAvg = loadResult.status === 'fulfilled' ? loadResult.value.stdout.replace(/[{}]/g, '').trim() : 'Unknown';
    const memPressure = pressureResult.status === 'fulfilled' ? pressureResult.value.stdout.trim() : 'Unknown';

    return NextResponse.json({
      success: true,
      data: {
        ...staticCache,
        ...semiStaticCache.data,
        cpu,
        memory,
        network,
        netBytes,
        uptime,
        loadAvg,
        memPressure
      }
    });

  } catch (error) {
    console.error('System stats error:', error);
    return NextResponse.json({ error: 'FETCH_STATS_FAILED' }, { status: 500 });
  }
}

