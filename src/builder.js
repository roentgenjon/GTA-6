// Geometrie-Builder: sammelt Vertices mit Farbe und UV, baut BufferGeometry
import * as THREE from 'three';

const _c = new THREE.Color();
export function rgb(hex) { _c.setHex(hex); return [_c.r, _c.g, _c.b]; }

export class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.v = 0; this.bone = 0; this.bi = []; }
  vert(x, y, z, nx, ny, nz, u, v, c) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(c[0], c[1], c[2]); this.bi.push(this.bone); return this.v++; }
  // Viereck a,b,c,d (gegen den Uhrzeigersinn von außen gesehen)
  quad(a, b, c, d, col, uvs = null, shade = 1) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const cc = typeof col === 'number' ? rgb(col) : col;
    const k = shade === 1 ? cc : [cc[0] * shade, cc[1] * shade, cc[2] * shade];
    const u = uvs || [0, 0, 1, 0, 1, 1, 0, 1];
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, u[0], u[1], k);
    const i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, u[2], u[3], k);
    const i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, u[4], u[5], k);
    const i3 = this.vert(d[0], d[1], d[2], nx, ny, nz, u[6], u[7], k);
    this.i.push(i0, i1, i2, i0, i2, i3);
  }
  tri(a, b, c, col, uv = [0, 0, 1, 0, 0.5, 1]) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const cc = typeof col === 'number' ? rgb(col) : col;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, uv[0], uv[1], cc), i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, uv[2], uv[3], cc), i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, uv[4], uv[5], cc);
    this.i.push(i0, i1, i2);
  }
  // Box mit Mittelpunkt; opt: {tex:{bw,fh,ou,ov}} Fassaden-UV an Seitenflächen, noTop, noBottom, shade
  box(cx, cy, cz, w, h, d, col, opt = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const cc = typeof col === 'number' ? rgb(col) : col;
    const t = opt.tex;
    const su = (len) => (t ? len / t.bw : 1), sv = h / (t ? t.fh : 1);
    const ou = t ? t.ou : 0, ov = t ? t.ov : 0;
    const side = (a, b, c, d2, len, ex) => {
      const u1 = ou + su(len) / 8, vv = ov + (t ? (h / t.fh) / 8 : 1);
      // y0 an ov, y1 an vv; die y-Basis hängt von y0 ab, damit Etagen ausgerichtet bleiben
      const vb = t ? ov + (a[1]) / (t.fh * 8) : 0, vt = t ? ov + (c[1]) / (t.fh * 8) : 1;
      this.quad(a, b, c, d2, cc, [ou, vb, u1, vb, u1, vt, ou, vt], ex);
    };
    // +z (vorne), -z, +x, -x
    side([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], w, 1);
    side([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], w, 0.92);
    side([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], d, 0.84);
    side([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], d, 0.78);
    if (!opt.noTop) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], cc, opt.topUV || [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], opt.topShade || 1.05);
    if (!opt.noBottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], cc, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 0.6);
  }
  // Giebeldach über Rechteck; Firstrichtung entlang x wenn alongX
  gable(cx, y0, cz, w, d, h, col, alongX = true, over = 0.4) {
    const cc = typeof col === 'number' ? rgb(col) : col;
    const x0 = cx - w / 2 - over, x1 = cx + w / 2 + over, z0 = cz - d / 2 - over, z1 = cz + d / 2 + over, y1 = y0 + h;
    const U = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    if (alongX) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, cz], [x0, y1, cz], cc, U, 1);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, cz], [x1, y1, cz], cc, U, 0.85);
      this.tri([x1, y0, z1], [x1, y0, z0], [x1, y1, cz], cc); this.tri([x0, y0, z0], [x0, y0, z1], [x0, y1, cz], cc);
    } else {
      this.quad([x1, y0, z1], [x1, y0, z0], [x1 - w / 2 - over, y1, z0], [x1 - w / 2 - over, y1, z1], cc, U, 0.9);
      this.quad([x0, y0, z0], [x0, y0, z1], [cx, y1, z1], [cx, y1, z0], cc, U, 0.8);
      this.tri([x0, y0, z1], [x1, y0, z1], [cx, y1, z1], cc); this.tri([x1, y0, z0], [x0, y0, z0], [cx, y1, z0], cc);
    }
  }
  // Zylinder (Y-Achse)
  cyl(cx, cy, cz, r0, r1, h, seg, col, cap = true) {
    const cc = typeof col === 'number' ? rgb(col) : col;
    const y0 = cy - h / 2, y1 = cy + h / 2;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad([cx + c1 * r0, y0, cz + s1 * r0], [cx + c0 * r0, y0, cz + s0 * r0], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], cc, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 0.8 + 0.2 * Math.cos(a0));
      if (cap && r1 > 0) this.tri([cx, y1, cz], [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1], cc);
    }
    // Hinweis: Deckel-Dreiecke zeigen nach oben (Reihenfolge so gewählt)
  }
  // Zylinder mit Achse X (Räder) bzw. Z (Tanks)
  cylX(cx, cy, cz, r, w, seg, col) {
    const cc = typeof col === 'number' ? rgb(col) : col, x0 = cx - w / 2, x1 = cx + w / 2, U = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const p0 = [cy + Math.cos(a0) * r, cz + Math.sin(a0) * r], p1 = [cy + Math.cos(a1) * r, cz + Math.sin(a1) * r];
      this.quad([x0, p1[0], p1[1]], [x1, p1[0], p1[1]], [x1, p0[0], p0[1]], [x0, p0[0], p0[1]], cc, U, 0.85);
      this.tri([x1, cy, cz], [x1, p0[0], p0[1]], [x1, p1[0], p1[1]], cc); this.tri([x0, cy, cz], [x0, p1[0], p1[1]], [x0, p0[0], p0[1]], cc);
    }
  }
  cylZ(cx, cy, cz, r, len, seg, col) {
    const cc = typeof col === 'number' ? rgb(col) : col, z0 = cz - len / 2, z1 = cz + len / 2, U = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
      this.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], cc, U, 0.8 + 0.2 * Math.sin(a0));
      this.tri([cx, cy, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1], cc); this.tri([cx, cy, z0], [p1[0], p1[1], z0], [p0[0], p0[1], z0], cc);
    }
  }
  // Glatte (indizierte) Kugel/Ellipsoid mit Verlauf – für Laub etc.
  sphere(cx, cy, cz, rx, ry, rz, col, rings = 4, seg = 8, jit = 0, seed = 1) {
    const cc = typeof col === 'number' ? rgb(col) : col, base = this.v;
    for (let i = 0; i <= rings; i++) for (let j = 0; j < seg; j++) {
      const th = (i / rings) * Math.PI, ph = (j / seg) * Math.PI * 2, nx = Math.sin(th) * Math.sin(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.cos(ph);
      const h = Math.sin((i * 12.9898 + j * 78.233 + seed * 37.719)) * 43758.5453, jt = jit ? 1 + ((h - Math.floor(h)) - 0.5) * jit : 1, k = 0.74 + 0.34 * (ny * 0.5 + 0.5) + 0.06 * (h - Math.floor(h));
      this.vert(cx + nx * rx * jt, cy + ny * ry * jt, cz + nz * rz * jt, nx, ny, nz, 0.5, 0.5, [cc[0] * k, cc[1] * k, cc[2] * k]);
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const j2 = (j + 1) % seg, a = base + i * seg + j, b2 = base + i * seg + j2, c2 = base + (i + 1) * seg + j2, d = base + (i + 1) * seg + j; this.i.push(a, c2, b2, a, d, c2); }
  }
  // Kegel/Kugel-ähnlicher Blob (Ikosaeder grob) für Laub
  blob(cx, cy, cz, r, col, ry = 1) {
    const cc = typeof col === 'number' ? rgb(col) : col;
    const rings = 3, seg = 6;
    const pts = [];
    for (let a = 0; a <= rings; a++) {
      const t = a / rings, ph = t * Math.PI, rad = Math.sin(ph) * r;
      for (let s = 0; s < seg; s++) { const th = (s / seg) * Math.PI * 2 + (a % 2) * 0.5; pts.push([cx + Math.cos(th) * rad, cy + Math.cos(ph) * r * ry, cz + Math.sin(th) * rad]); }
    }
    for (let a = 0; a < rings; a++) for (let s = 0; s < seg; s++) {
      const a0 = a * seg + s, a1 = a * seg + (s + 1) % seg, b0 = (a + 1) * seg + s, b1 = (a + 1) * seg + (s + 1) % seg;
      this.tri(pts[a0], pts[b0], pts[a1], cc); this.tri(pts[a1], pts[b0], pts[b1], cc);
    }
  }
  // Prisma entlang Z-Extrusion aus 2D Polygon (x,y)->x,y; z von z0..z1
  extrude(poly, z0, z1, col, shadeSide = 0.9) {
    const cc = typeof col === 'number' ? rgb(col) : col;
    const n = poly.length, U = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    for (let k = 0; k < n; k++) {
      const a = poly[k], b = poly[(k + 1) % n];
      this.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], cc, U, 0.8 + 0.2 * Math.abs(b[1] - a[1] > 0 ? 0 : 1));
    }
    // Deckel (Fächer, konvex vorausgesetzt)
    for (let k = 1; k < n - 1; k++) {
      this.tri([poly[0][0], poly[0][1], z1], [poly[k][0], poly[k][1], z1], [poly[k + 1][0], poly[k + 1][1], z1], cc);
      this.tri([poly[0][0], poly[0][1], z0], [poly[k + 1][0], poly[k + 1][1], z0], [poly[k][0], poly[k][1], z0], cc);
    }
  }
  get empty() { return this.v === 0; }
  build(skin = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    if (skin) { const si = new Uint16Array(this.v * 4), sw = new Float32Array(this.v * 4); for (let k = 0; k < this.v; k++) { si[k * 4] = this.bi[k]; sw[k * 4] = 1; } g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); }
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
