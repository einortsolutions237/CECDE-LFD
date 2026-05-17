export function buildNetworkStats(users: any[]) {
  const adjList = new Map<string, string[]>();
  users.forEach(u => adjList.set(u.id, []));
  
  users.forEach(u => {
    if (u.sponsorId && adjList.has(u.sponsorId)) {
      adjList.get(u.sponsorId)!.push(u.id);
    }
  });

  const stats = new Map<string, { directCount: number, downlineCount: number }>();
  
  users.forEach(user => {
    const directs = adjList.get(user.id) || [];
    const directCount = directs.length;
    
    let downlineCount = 0;
    const stack = [...directs];
    while (stack.length > 0) {
      const current = stack.pop()!;
      downlineCount++;
      const children = adjList.get(current) || [];
      stack.push(...children);
    }
    
    stats.set(user.id, { directCount, downlineCount });
  });

  return stats;
}
