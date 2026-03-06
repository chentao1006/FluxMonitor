import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Basic macOS specific stats

    // CPU Load
    const { stdout: cpuRaw } = await execAsync("top -l 1 -n 0 | grep 'CPU usage'");
    const cpuMatch = cpuRaw.match(/(\d+\.\d+)% user, (\d+\.\d+)% sys, (\d+\.\d+)% idle/);
    const cpu = cpuMatch ? {
      user: parseFloat(cpuMatch[1]),
      sys: parseFloat(cpuMatch[2]),
      idle: parseFloat(cpuMatch[3]),
    } : null;

    // Memory Usage
    // Memory Usage - Use vm_stat for more accurate macOS memory reporting
    const { stdout: physMemRaw } = await execAsync("sysctl -n hw.memsize");
    const totalBytes = parseInt(physMemRaw.trim());
    const totalMB = Math.round(totalBytes / 1024 / 1024);
    let memory = { freeMB: 0, usedMB: 0, totalMB };

    try {
      const [{ stdout: vmStatRaw }, { stdout: pageSizeRaw }] = await Promise.all([
        execAsync("vm_stat"),
        execAsync("sysctl -n vm.pagesize")
      ]);

      const pageSize = parseInt(pageSizeRaw.trim());
      const vmStatLines = vmStatRaw.split('\n');

      const getPages = (key: string) => {
        const line = vmStatLines.find(l => l.includes(key));
        if (!line) return 0;
        const match = line.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };

      const freePages = getPages('Pages free');
      const inactivePages = getPages('Pages inactive');
      const speculativePages = getPages('Pages speculative');
      // On macOS, inactive and speculative memory can be reclaimed, so they are effectively "available"
      const availableBytes = (freePages + inactivePages + speculativePages) * pageSize;
      const availableMB = Math.round(availableBytes / 1024 / 1024);

      memory.freeMB = availableMB;
      memory.usedMB = Math.max(0, totalMB - availableMB);
    } catch (e) {
      console.error('Memory parse error:', e);
      // Fallback to basic calculation if vm_stat fails
      memory.usedMB = Math.round(totalMB * 0.8); // Generic fallback
      memory.freeMB = totalMB - memory.usedMB;
    }

    // Disk Usage
    let disk = { total: '0 GB', used: '0 GB', free: '0 GB', percent: '0%' };
    try {
      // df -H uses 1000-based units (GB) which matches macOS Finder/Disk Utility exactly.
      // On macOS APFS, df -H for any volume in the container reflects the shared availability.
      const { stdout } = await execAsync("df -H /");
      const lines = stdout.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        // df -H columns: Filesystem, Size, Used, Avail, Capacity, iused, ifree, %iused, Mounted on
        const totalStr = parts[1]; // e.g. "494G" or "494Gi"
        const availStr = parts[3];
        const capacityPercent = parts[4];

        // Convert to consistent GB strings
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
    } catch (e) {
      console.error(e);
    }

    // Uptime
    const { stdout: uptimeRaw } = await execAsync("uptime");

    // OS Version
    let osVersion = 'Unknown';
    try {
      const { stdout: swRaw } = await execAsync("sw_vers");
      const productName = swRaw.match(/ProductName:\s+(.+)/)?.[1] || '';
      const productVersion = swRaw.match(/ProductVersion:\s+(.+)/)?.[1] || '';
      osVersion = `${productName} ${productVersion}`.trim();
    } catch (e) { }

    // Network
    let network = 'Unknown';
    let netBytes = { in: 0, out: 0 };
    try {
      const { stdout: netRaw } = await execAsync("top -l 1 -n 0 | grep 'Networks:'");
      network = netRaw.replace('Networks:', '').trim();

      const { stdout: netstatRaw } = await execAsync("netstat -ib | awk 'NR>1 && $1 != \"lo0\" && $1 !~ /\\*/ {in_b+=$7; out_b+=$10} END {print in_b \" \" out_b}'");
      const [inB, outB] = netstatRaw.trim().split(' ').map(Number);
      if (!isNaN(inB) && !isNaN(outB)) {
        netBytes = { in: inB, out: outB };
      }
    } catch (e) { }

    // Load Average
    let loadAvg = 'Unknown';
    try {
      const { stdout: loadRaw } = await execAsync("sysctl -n vm.loadavg");
      loadAvg = loadRaw.replace(/[{}]/g, '').trim();
    } catch (e) { }

    // More Info
    const { stdout: hostname } = await execAsync("hostname");
    const { stdout: kernel } = await execAsync("uname -sr");
    const { stdout: arch } = await execAsync("uname -m");
    const { stdout: cpuModel } = await execAsync("sysctl -n machdep.cpu.brand_string");

    let swap = 'Unknown';
    try {
      const { stdout: swapRaw } = await execAsync("sysctl -n vm.swapusage");
      const swapMatch = swapRaw.match(/total = (\d+\.\d+M).*used = (\d+\.\d+M).*free = (\d+\.\d+M)/);
      if (swapMatch) {
        swap = `${swapMatch[2]} / ${swapMatch[1]}`;
      }
    } catch (e) { }

    let memPressure = 'Unknown';
    try {
      const { stdout: pressureRaw } = await execAsync("sysctl -n kern.memorystatus_level"); // Corrected from memo_status_level
      memPressure = pressureRaw.trim(); // No '%' needed, it's a level (0-5)
    } catch (e) { }

    // Battery
    let battery = 'Unknown';
    try {
      const { stdout: battRaw } = await execAsync("pmset -g batt");
      const match = battRaw.match(/(\d+)%/);
      if (match) {
        battery = `${match[1]}%`;
        if (battRaw.includes('discharging')) battery += ' (放电)';
        else if (battRaw.includes('charging')) battery += ' (充电)';
        else battery += ' (电源)';
      }
    } catch (e) { }

    return NextResponse.json({
      success: true,
      data: {
        cpu,
        memory,
        disk,
        uptime: uptimeRaw.trim(),
        osVersion,
        network,
        netBytes,
        loadAvg,
        battery,
        hostname: hostname.trim(),
        kernel: kernel.trim(),
        arch: arch.trim(),
        cpuModel: cpuModel.trim(),
        swap,
        memPressure
      }
    });

  } catch (error) {
    console.error('System stats error:', error);
    return NextResponse.json({ error: '无法获取系统状态' }, { status: 500 });
  }
}
