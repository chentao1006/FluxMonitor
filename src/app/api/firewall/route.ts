import { handleFirewallGet, handleFirewallPut } from '@/lib/firewall-server';

export const dynamic = 'force-dynamic';
export const GET = handleFirewallGet;
export const PUT = handleFirewallPut;
