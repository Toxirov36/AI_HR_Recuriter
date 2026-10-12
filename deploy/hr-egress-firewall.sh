#!/usr/bin/env bash
set -euo pipefail
# The hosting panel drops forwarded traffic unless explicitly allowed.
# Manage only an HR-specific chain; leave other applications' rules intact.
command -v nft >/dev/null || exit 0
nft list chain inet profile_hosting forward >/dev/null 2>&1 || exit 0
network=ai-hr-recruiter_default
network_id=$(docker network inspect --format '{{.Id}}' "$network" 2>/dev/null) || exit 0
bridge=$(docker network inspect --format '{{index .Options "com.docker.network.bridge.name"}}' "$network")
if [[ -z "$bridge" || "$bridge" == '<no value>' ]]; then bridge="br-${network_id:0:12}"; fi
subnet=$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}' "$network")
wan=$(ip -4 route show default | awk '/default/ {for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1);exit}}')
[[ "$bridge" =~ ^[a-zA-Z0-9_-]{1,15}$ && "$wan" =~ ^[a-zA-Z0-9_-]{1,15}$ && "$subnet" =~ ^[0-9.]+/[0-9]+$ ]] || exit 1
chain=hr_recruiter_egress
if ! nft list chain inet profile_hosting "$chain" >/dev/null 2>&1; then
  nft add chain inet profile_hosting "$chain"
fi
# Replace only our chain atomically so stale bridge names cannot accumulate.
nft -f - <<EOF
flush chain inet profile_hosting $chain
add rule inet profile_hosting $chain iifname "$bridge" oifname "$bridge" ip saddr $subnet ip daddr $subnet counter accept
add rule inet profile_hosting $chain iifname "$bridge" oifname "$wan" ip saddr $subnet meta l4proto { tcp, udp } th dport 53 counter accept
add rule inet profile_hosting $chain iifname "$bridge" oifname "$wan" ip saddr $subnet tcp dport { 443, 465, 587 } counter accept
add rule inet profile_hosting $chain iifname "$wan" oifname "$bridge" ip daddr $subnet ct state established,related counter accept
EOF
if ! nft list chain inet profile_hosting forward | grep -Fq 'comment "hr-recruiter-egress"'; then
  nft insert rule inet profile_hosting forward jump "$chain" comment '"hr-recruiter-egress"'
fi
