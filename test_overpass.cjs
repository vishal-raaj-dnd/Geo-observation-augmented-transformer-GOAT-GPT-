const eps = [
  'https://overpass-api.de/api/interpreter',
];
(async () => {
  for (const ep of eps) {
    try {
      const q = '[out:json][timeout:25];relation["name"="Chennai"]["boundary"="administrative"];out geom;';
      const r = await fetch(ep + '?data=' + encodeURIComponent(q), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*'
        }
      });
      console.log(ep.split('/')[2], 'HTTP', r.status);
      if (!r.ok) continue;
      const d = await r.json();
      const rels = (d.elements || []).filter(e => e.type === 'relation' && e.members);
      console.log('relations:', rels.length);
      for (const rel of rels.slice(0, 2)) {
        console.log('rel', rel.id, '| tags:', JSON.stringify(rel.tags));
        const members = rel.members || [];
        console.log('member types:', JSON.stringify(members.reduce((a, m) => { a[m.type] = (a[m.type] || 0) + 1; return a; }, {})));
        console.log('roles:', JSON.stringify(members.reduce((a, m) => { a[m.role || '(none)'] = (a[m.role || '(none)'] || 0) + 1; return a; }, {})));
        // inspect first few members raw
        console.log('first 5 members:', JSON.stringify(members.slice(0, 5)).slice(0, 600));
        const outers = members.filter(m => m.type === 'way' && m.role === 'outer' && m.geometry);
        console.log('outer ways with geometry:', outers.length);
        if (outers.length) {
          const g0 = outers[0].geometry;
          console.log('way0 geometry is array:', Array.isArray(g0), '| length:', Array.isArray(g0) ? g0.length : '-', '| sample:', JSON.stringify(Array.isArray(g0) ? g0.slice(0, 3) : g0));
        }
      }
    } catch (e) {
      console.log(ep, 'ERR', e.message);
    }
  }
})();
