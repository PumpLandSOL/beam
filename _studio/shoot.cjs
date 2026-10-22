// node shoot.cjs <path> <out> [w] [h] [scrollY] [wait]
const { open, sleep } = require('./cdp.cjs'); const [, , p, out, w = 1440, h = 900, sy = 0, wait = 6000] = process.argv;
(async () => { const c = await open('about:blank', +w, +h, 9700 + Math.floor(Math.random() * 200)); await c.send('Page.navigate', { url: 'http://localhost:8232' + p }); await sleep(2500); await c.ev('scrollTo(0,' + sy + ');1'); await sleep(+wait); await c.shot(out); c.close(); process.exit(0); })();
