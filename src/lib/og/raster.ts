/**
 * Tiny pure-JS rasterizer + PNG codec used to draw Tugg share images on the server
 * (and anywhere else JS runs). No native code, no WebAssembly.
 */
export type RGBA = [number, number, number, number];

export function hex(c: string, a = 1): RGBA {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const v = m ? parseInt(m[1]!, 16) : 0xffffff;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, a];
}

export type Poly = number[]; // flat x,y list, implicitly closed

export class Raster {
  data: Uint8ClampedArray;
  constructor(
    public w: number,
    public h: number,
    bg: RGBA,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 4] = bg[0];
      this.data[i * 4 + 1] = bg[1];
      this.data[i * 4 + 2] = bg[2];
      this.data[i * 4 + 3] = 255;
    }
  }

  private blend(i: number, c: RGBA, cov: number) {
    const a = Math.min(1, cov) * c[3];
    if (a <= 0) return;
    const d = this.data;
    d[i] = d[i]! + (c[0] - d[i]!) * a;
    d[i + 1] = d[i + 1]! + (c[1] - d[i + 1]!) * a;
    d[i + 2] = d[i + 2]! + (c[2] - d[i + 2]!) * a;
  }

  /** Non-zero winding fill with 4x vertical / exact horizontal anti-aliasing. */
  fill(polys: Poly[], c: RGBA) {
    type E = [number, number, number, number, number];
    const edges: E[] = [];
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const p of polys) {
      const n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const x0 = p[i * 2]!, y0 = p[i * 2 + 1]!;
        const j = (i + 1) % n;
        const x1 = p[j * 2]!, y1 = p[j * 2 + 1]!;
        minX = Math.min(minX, x0); maxX = Math.max(maxX, x0);
        if (y0 === y1) continue;
        const e: E = y0 < y1 ? [x0, y0, x1, y1, 1] : [x1, y1, x0, y0, -1];
        edges.push(e);
        minY = Math.min(minY, e[1]); maxY = Math.max(maxY, e[3]);
      }
    }
    if (!edges.length) return;
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(this.w - 1, Math.ceil(maxX));
    if (x1 < x0) return;
    edges.sort((a, b) => a[1] - b[1]);
    const acc = new Float32Array(x1 - x0 + 2);
    const S = 4;
    const xs: [number, number][] = [];
    for (let y = y0; y <= y1; y++) {
      acc.fill(0);
      let any = false;
      for (let s = 0; s < S; s++) {
        const sy = y + (s + 0.5) / S;
        xs.length = 0;
        for (const e of edges) {
          if (e[1] > sy) break;
          if (e[3] <= sy) continue;
          xs.push([e[0] + ((sy - e[1]) / (e[3] - e[1])) * (e[2] - e[0]), e[4]]);
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a[0] - b[0]);
        let wind = 0;
        for (let k = 0; k < xs.length - 1; k++) {
          wind += xs[k]![1];
          if (wind === 0) continue;
          const a = Math.max(x0, xs[k]![0]), b = Math.min(x1 + 1, xs[k + 1]![0]);
          if (b <= a) continue;
          any = true;
          const ia = Math.floor(a), ib = Math.floor(b);
          if (ia === ib) acc[ia - x0]! += (b - a) / S;
          else {
            acc[ia - x0]! += (ia + 1 - a) / S;
            for (let x = ia + 1; x < ib; x++) acc[x - x0]! += 1 / S;
            if (ib - x0 < acc.length) acc[ib - x0]! += (b - ib) / S;
          }
        }
      }
      if (!any) continue;
      const row = y * this.w;
      for (let x = x0; x <= x1; x++) {
        const v = acc[x - x0]!;
        if (v > 0.001) this.blend((row + x) * 4, c, v);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA) {
    this.fill([[x, y, x + w, y, x + w, y + h, x, y + h]], c);
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, c: RGBA) {
    this.fill([roundRectPoly(x, y, w, h, r)], c);
  }

  circle(cx: number, cy: number, r: number, c: RGBA) {
    const p: Poly = [];
    const n = Math.max(24, Math.ceil(r * 1.5));
    for (let i = 0; i < n; i++) p.push(cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r);
    this.fill([p], c);
  }

  /** Bilinear, alpha-blended image draw. */
  image(img: { w: number; h: number; rgba: Uint8Array }, dx: number, dy: number, dw: number, dh: number) {
    const sx = img.w / dw, sy = img.h / dh;
    for (let y = Math.max(0, Math.floor(dy)); y < Math.min(this.h, Math.ceil(dy + dh)); y++) {
      for (let x = Math.max(0, Math.floor(dx)); x < Math.min(this.w, Math.ceil(dx + dw)); x++) {
        const u = Math.min(img.w - 1, Math.max(0, (x - dx + 0.5) * sx - 0.5));
        const v = Math.min(img.h - 1, Math.max(0, (y - dy + 0.5) * sy - 0.5));
        const ux = Math.floor(u), vy = Math.floor(v);
        const fx = u - ux, fy = v - vy;
        const px = Math.min(img.w - 1, ux + 1), py = Math.min(img.h - 1, vy + 1);
        const out = [0, 0, 0, 0];
        const taps: [number, number, number][] = [[ux, vy, (1 - fx) * (1 - fy)], [px, vy, fx * (1 - fy)], [ux, py, (1 - fx) * fy], [px, py, fx * fy]];
        for (const [tx, ty, wgt] of taps) {
          const i = (ty * img.w + tx) * 4;
          const a = img.rgba[i + 3]! / 255;
          out[0]! += img.rgba[i]! * a * wgt;
          out[1]! += img.rgba[i + 1]! * a * wgt;
          out[2]! += img.rgba[i + 2]! * a * wgt;
          out[3]! += a * wgt;
        }
        if (out[3]! <= 0.002) continue;
        this.blend((y * this.w + x) * 4, [out[0]! / out[3]!, out[1]! / out[3]!, out[2]! / out[3]!, 1], out[3]!);
      }
    }
  }
}

export function roundRectPoly(x: number, y: number, w: number, h: number, r: number): Poly {
  r = Math.min(r, w / 2, h / 2);
  const p: Poly = [];
  const corner = (cx: number, cy: number, start: number) => {
    for (let i = 0; i <= 8; i++) {
      const t = start + (i / 8) * (Math.PI / 2);
      p.push(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return p;
}

/** Flatten opentype.js path commands into polygons. */
export function flattenCommands(cmds: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): Poly[] {
  const out: Poly[] = [];
  let cur: Poly = [];
  let px = 0, py = 0;
  for (const c of cmds) {
    if (c.type === "M") {
      if (cur.length > 4) out.push(cur);
      cur = [c.x!, c.y!];
      px = c.x!; py = c.y!;
    } else if (c.type === "L") {
      cur.push(c.x!, c.y!);
      px = c.x!; py = c.y!;
    } else if (c.type === "Q") {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, m = 1 - t;
        cur.push(m * m * px + 2 * m * t * c.x1! + t * t * c.x!, m * m * py + 2 * m * t * c.y1! + t * t * c.y!);
      }
      px = c.x!; py = c.y!;
    } else if (c.type === "C") {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12, m = 1 - t;
        cur.push(
          m * m * m * px + 3 * m * m * t * c.x1! + 3 * m * t * t * c.x2! + t * t * t * c.x!,
          m * m * m * py + 3 * m * m * t * c.y1! + 3 * m * t * t * c.y2! + t * t * t * c.y!,
        );
      }
      px = c.x!; py = c.y!;
    } else if (c.type === "Z") {
      if (cur.length > 4) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 4) out.push(cur);
  return out;
}

// ---------- PNG ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function zlib(data: Uint8Array, mode: "compress" | "decompress") {
  const stream = new Response(data as BodyInit).body!.pipeThrough(
    mode === "compress" ? new CompressionStream("deflate") : new DecompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePng(r: Raster): Promise<Uint8Array> {
  const stride = r.w * 3 + 1;
  const raw = new Uint8Array(stride * r.h);
  for (let y = 0; y < r.h; y++) {
    raw[y * stride] = 1; // Sub filter: compresses flat areas well
    for (let x = 0; x < r.w; x++) {
      const i = (y * r.w + x) * 4;
      const o = y * stride + 1 + x * 3;
      const pi = x ? i - 4 : -1;
      for (let k = 0; k < 3; k++) raw[o + k] = (r.data[i + k]! - (pi >= 0 ? r.data[pi + k]! : 0)) & 255;
    }
  }
  const idat = await zlib(raw, "compress");
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, r.w);
  dv.setUint32(4, r.h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** Decodes non-interlaced 8-bit RGB/RGBA/grey and 1–8-bit palette PNGs to RGBA. */
export async function decodePng(bytes: Uint8Array): Promise<{ w: number; h: number; rgba: Uint8Array } | null> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off);
    const t = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    const body = bytes.subarray(off + 8, off + 8 + len);
    if (t === "IHDR") { w = dv.getUint32(off + 8); h = dv.getUint32(off + 12); depth = body[8]!; type = body[9]!; interlace = body[12]!; }
    else if (t === "PLTE") palette = body;
    else if (t === "tRNS") trns = body;
    else if (t === "IDAT") idat.push(body);
    else if (t === "IEND") break;
    off += 12 + len;
  }
  if (!w || interlace || (type !== 3 && depth !== 8)) return null;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!channels) return null;
  const all = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of idat) { all.set(p, o); o += p.length; }
  const raw = await zlib(all, "decompress");
  const bpp = Math.max(1, (channels * depth) / 8);
  const stride = Math.ceil((w * channels * depth) / 8);
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y ? px[(y - 1) * stride + x]! : 0;
      const c = y && x >= bpp ? px[(y - 1) * stride + x - bpp]! : 0;
      const v = raw[src + x]!;
      let r = v;
      if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = r & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (type === 3) {
        const bit = x * depth;
        const idx = (px[y * stride + (bit >> 3)]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        rgba[i] = palette?.[idx * 3] ?? 0; rgba[i + 1] = palette?.[idx * 3 + 1] ?? 0; rgba[i + 2] = palette?.[idx * 3 + 2] ?? 0;
        rgba[i + 3] = trns && idx < trns.length ? trns[idx]! : 255;
      } else {
        const s = y * stride + x * channels;
        const g = px[s]!;
        if (type === 0) { rgba.set([g, g, g, 255], i); }
        else if (type === 4) { rgba.set([g, g, g, px[s + 1]!], i); }
        else if (type === 2) { rgba.set([px[s]!, px[s + 1]!, px[s + 2]!, 255], i); }
        else rgba.set([px[s]!, px[s + 1]!, px[s + 2]!, px[s + 3]!], i);
      }
    }
  return { w, h, rgba };
}
