import { NextResponse } from 'next/server';
import { execAsync } from '@/lib/exec';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pidParam = searchParams.get('pid');

    if (pidParam) {
      if (!/^\d+$/.test(pidParam)) {
        return NextResponse.json({ error: 'INVALID_PID' }, { status: 400 });
      }

      // Get detailed info for a single process
      // macOS ps options: pid,ppid,pcpu,pmem,state,start,time,user,comm,args
      // Use -ww for wide output to avoid truncation
      const { stdout: psOut } = await execAsync(`ps -p ${pidParam} -o pid,ppid,pcpu,pmem,state,start,time,user,comm,args -ww | tail -n +2`);

      if (!psOut.trim()) {
        return NextResponse.json({ error: 'PROCESS_NOT_FOUND' }, { status: 404 });
      }

      // Robust parsing: the first 8 fields are guaranteed not to have spaces (mostly)
      // except for 'start' which might have multiple parts in some ps versions, 
      // but on macOS 'start' is usually a single string like '14:00' or ' 5Mar24' (with potential space)
      // To be safe, let's use a regex that matches the first 8 columns.
      // pid, ppid, pcpu, pmem, state, start, time, user
      const match = psOut.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);

      if (!match) {
        return NextResponse.json({ error: 'PARSE_FAILED' }, { status: 500 });
      }

      const [_, pid, ppid, cpu, mem, state, start, time, user, rest] = match;

      // Now we need to separate 'comm' and 'args'. 
      // This is still tricky because 'args' usually starts with 'comm'.
      // However, for the detail view, we can often just use 'comm' as the path.
      // Let's try to get 'comm' specifically to be sure.
      const { stdout: commOut } = await execAsync(`ps -p ${pidParam} -o comm= -ww`);
      const commandPath = commOut.trim();
      const fullCommand = rest.trim();

      // Get parent process name
      let ppidName = '';
      if (ppid && ppid !== '0') {
        try {
          const { stdout: ppidOut } = await execAsync(`ps -p ${ppid} -o comm= -ww`);
          ppidName = ppidOut.trim().split('/').pop() || '';
        } catch (e) {
          ppidName = 'Unknown';
        }
      }

      // Get open files using lsof
      let openFiles: string[] = [];
      try {
        const { stdout: lsofOut } = await execAsync(`lsof -p ${pidParam} -n -P | tail -n +2 | head -n 50`);
        openFiles = lsofOut.trim().split('\n').map(line => line.trim()).filter(Boolean);
      } catch (e) {
        console.error('lsof failed', e);
      }

      return NextResponse.json({
        success: true,
        data: {
          pid, ppid, ppidName, cpu, mem, state, start, time, user,
          command: commandPath,
          fullCommand,
          openFiles
        }
      });
    }

    const limit = parseInt(searchParams.get('limit') || '50');
    const sort = searchParams.get('sort') || 'cpu'; // cpu, mem

    let sortFlag = '-r'; // default cpu
    if (sort === 'mem') sortFlag = '-m';

    // Get processes with -ww for wide output
    const { stdout } = await execAsync(`ps -eo pid,pcpu,pmem,user,comm ${sortFlag} -ww | head -n ${limit + 1}`);

    const lines = stdout.trim().split('\n');
    lines.shift(); // Remove header

    const processes = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts.shift();
      const pcpu = parts.shift();
      const pmem = parts.shift();
      const user = parts.shift();
      const comm = parts.join(' '); // Everything else is the command path
      const name = comm.split('/').pop() || ''; // Extract just the executable name

      return { pid, cpu: pcpu, mem: pmem, user, command: name };
    });

    return NextResponse.json({ success: true, data: processes });
  } catch (error) {
    return NextResponse.json({ error: 'FETCH_LIST_FAILED' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, pid } = await request.json();

    if ((action === 'kill' || action === 'term') && pid) {
      if (!/^\d+$/.test(pid)) {
        return NextResponse.json({ error: 'INVALID_PID' }, { status: 400 });
      }

      const signal = action === 'kill' ? '-9' : '-15';
      try {
        await execAsync(`kill ${signal} ${pid}`);
        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        const error = err as Error;
        const msg = error.message || '';
        if (msg.includes('Operation not permitted') || msg.includes('Permission denied')) {
          return NextResponse.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
        }
        return NextResponse.json({ error: 'PROCESS_ACTION_FAILED', details: msg }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: 'EXECUTION_FAILED', details: error.message }, { status: 500 });
  }
}
