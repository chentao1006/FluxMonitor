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
    const { stdout: memRaw } = await execAsync("vm_stat");
    const pageSize = 4096; // typical macOS page size
    const freePagesMatch = memRaw.match(/Pages free:\s+(\d+)/);
    const activePagesMatch = memRaw.match(/Pages active:\s+(\d+)/);
    const inactivePagesMatch = memRaw.match(/Pages inactive:\s+(\d+)/);

    let memory = {};
    if (freePagesMatch && activePagesMatch && inactivePagesMatch) {
      const free = parseInt(freePagesMatch[1]) * pageSize;
      const active = parseInt(activePagesMatch[1]) * pageSize;
      const inactive = parseInt(inactivePagesMatch[1]) * pageSize;
      const used = active + inactive;

      memory = {
        freeMB: Math.round(free / 1024 / 1024),
        usedMB: Math.round(used / 1024 / 1024),
        totalMB: Math.round((free + used) / 1024 / 1024)
      };
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

    // Battery
    let battery = 'Unknown';
    try {
      const { stdout: battRaw } = await execAsync("pmset -g batt");
      const match = battRaw.match(/(\d+)%/);
      if (match) {
        battery = `${match[1]}%`;
        if (battRaw.includes('discharging')) battery += ' (放电中)';
        else if (battRaw.includes('charging')) battery += ' (充电中)';
        else battery += ' (使用电源)';
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
        battery
      }
    });

  } catch (error) {
    console.error('System stats error:', error);
    return NextResponse.json({ error: '无法获取系统状态' }, { status: 500 });
  }
}
