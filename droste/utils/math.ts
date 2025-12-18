import { Point, Quad } from '../types';

// Solves linear system for Homography Matrix (8 degrees of freedom)
export function computeHomography(srcWidth: number, srcHeight: number, dst: Quad): number[] {
  const x0 = dst.p1.x, y0 = dst.p1.y;
  const x1 = dst.p2.x, y1 = dst.p2.y;
  const x2 = dst.p3.x, y2 = dst.p3.y;
  const x3 = dst.p4.x, y3 = dst.p4.y;
  const w = srcWidth;
  const h = srcHeight;

  // Gaussian elimination solver for Ax=B
  const systems: number[][] = [
    [0, 0, 1, 0, 0, 0, -0*x0, -0*x0, x0],
    [0, 0, 0, 0, 0, 1, -0*y0, -0*y0, y0],
    [w, 0, 1, 0, 0, 0, -w*x1, -0*x1, x1],
    [0, 0, 0, w, 0, 1, -w*y1, -0*y1, y1],
    [w, h, 1, 0, 0, 0, -w*x2, -h*x2, x2],
    [0, 0, 0, w, h, 1, -w*y2, -h*y2, y2],
    [0, h, 1, 0, 0, 0, -0*x3, -h*x3, x3],
    [0, 0, 0, 0, h, 1, -0*y3, -h*y3, y3],
  ];

  const A = systems.map(r => r.slice(0, 8));
  const B = systems.map(r => r[8]);
  
  try {
    const X = solveLinearSystem(A, B);
    if (X.some(val => isNaN(val) || !isFinite(val))) {
      throw new Error("Matrix singular");
    }
    return [...X, 1];
  } catch (e) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
}

export function multiplyMatrix(a: number[], b: number[]): number[] {
  const c = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += a[i * 3 + k] * b[k * 3 + j];
      }
      c[i * 3 + j] = sum;
    }
  }
  return c;
}

export function invertMatrix(m: number[]): number[] {
  const m00 = m[0], m01 = m[1], m02 = m[2];
  const m10 = m[3], m11 = m[4], m12 = m[5];
  const m20 = m[6], m21 = m[7], m22 = m[8];

  const b01 = m22 * m11 - m12 * m21;
  const b11 = -m22 * m10 + m12 * m20;
  const b21 = m21 * m10 - m11 * m20;

  const det = m00 * b01 + m01 * b11 + m02 * b21;

  if (!det) return [1,0,0,0,1,0,0,0,1];

  return [
    b01 / det,
    (-m22 * m01 + m02 * m21) / det,
    (m12 * m01 - m02 * m11) / det,
    b11 / det,
    (m22 * m00 - m02 * m20) / det,
    (-m12 * m00 + m02 * m10) / det,
    b21 / det,
    (-m21 * m00 + m01 * m20) / det,
    (m11 * m00 - m01 * m10) / det
  ];
}

function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    if (maxEl < 1e-10) return new Array(n).fill(0);

    for (let k = i; k < n; k++) {
      const tmp = A[maxRow][k];
      A[maxRow][k] = A[i][k];
      A[i][k] = tmp;
    }
    const tmp = B[maxRow];
    B[maxRow] = B[i];
    B[i] = tmp;

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      B[k] += c * B[i];
    }
  }

  const X = new Array(n).fill(0);
  for (let i = n - 1; i > -1; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * X[j];
    }
    X[i] = (B[i] - sum) / A[i][i];
  }
  return X;
}

export function transformPoint(h: number[], x: number, y: number): Point {
  const px = h[0] * x + h[1] * y + h[2];
  const py = h[3] * x + h[4] * y + h[5];
  const w = h[6] * x + h[7] * y + h[8];
  if (Math.abs(w) < 1e-8) return { x: px, y: py };
  return { x: px / w, y: py / w };
}

export function findFixedPoint(h: number[], w: number, hg: number): Point {
  let cx = w / 2;
  let cy = hg / 2;
  for (let i = 0; i < 20; i++) {
    const next = transformPoint(h, cx, cy);
    if (isNaN(next.x) || isNaN(next.y)) return { x: w/2, y: hg/2 };
    cx = next.x;
    cy = next.y;
  }
  return { x: cx, y: cy };
}

// Robust affine mapping for 3 points with seam mitigation
export function applyAffineTriangle(ctx: CanvasRenderingContext2D, src: Point[], dst: Point[], img: HTMLImageElement) {
   const x0 = src[0].x, y0 = src[0].y;
   const x1 = src[1].x, y1 = src[1].y;
   const x2 = src[2].x, y2 = src[2].y;
   
   const u0 = dst[0].x, v0 = dst[0].y;
   const u1 = dst[1].x, v1 = dst[1].y;
   const u2 = dst[2].x, v2 = dst[2].y;

   const dx1 = x1 - x0, dy1 = y1 - y0, du1 = u1 - u0;
   const dx2 = x2 - x0, dy2 = y2 - y0, du2 = u2 - u0;
   
   const det = dx1 * dy2 - dx2 * dy1;
   if (Math.abs(det) < 1e-6) return;

   const a = (du1 * dy2 - du2 * dy1) / det;
   const c = (dx1 * du2 - dx2 * du1) / det;
   const e = u0 - a * x0 - c * y0;

   const dv1 = v1 - v0;
   const dv2 = v2 - v0;

   const b = (dv1 * dy2 - dv2 * dy1) / det;
   const d = (dx1 * dv2 - dx2 * dv1) / det;
   const f = v0 - b * x0 - d * y0;

   ctx.save();
   ctx.beginPath();
   ctx.moveTo(u0, v0);
   ctx.lineTo(u1, v1);
   ctx.lineTo(u2, v2);
   ctx.closePath();
   ctx.clip();
   
   ctx.transform(a, b, c, d, e, f);
   ctx.drawImage(img, 0, 0);
   ctx.restore();
}

/**
 * Computes the t-th power of a 2x2 matrix M = [[a, b], [c, d]]
 * This handles both Real (stretch) and Complex (spiral) eigenvalues correctly.
 */
export function getMatrixPower2x2(a: number, b: number, c: number, d: number, t: number): {a: number, b: number, c: number, d: number} {
  const trace = a + d;
  const det = a * d - b * c;
  
  // Discriminant
  const delta = trace * trace - 4 * det;

  // Identity matrix
  const I = { a: 1, b: 0, c: 0, d: 1 };
  
  // Matrix M
  const M = { a, b, c, d };

  // Tolerance for float comparison
  const EPS = 1e-9;

  if (delta < -EPS) {
    // Complex eigenvalues (Spiral case)
    // lambda = (trace +/- i*sqrt(-delta)) / 2
    // Write lambda = r * e^(+/- i*theta)
    const r = Math.sqrt(det);
    // theta is determined by cos(theta) = trace / (2r)
    // We use atan2 to be safe with signs
    const theta = Math.acos(Math.max(-1, Math.min(1, trace / (2 * r))));
    
    // According to the formula for 2x2 matrix powers with complex eigenvalues:
    // M^t = r^t * ( sin((1-t)theta)/sin(theta) * I + sin(t*theta)/sin(theta) * (M/r) )
    
    const rt = Math.pow(r, t);
    const sinTheta = Math.sin(theta);
    
    // Avoid division by zero if theta is 0 (should not happen if delta < 0)
    if (Math.abs(sinTheta) < EPS) return I;

    const c1 = Math.sin((1 - t) * theta) / sinTheta;
    const c2 = Math.sin(t * theta) / sinTheta; // note: M is not normalized by r here, we do it below

    // M^t = rt * (c1 * I + c2 * (M/r))
    // M^t = rt * c1 * I + rt * c2/r * M
    
    const f1 = rt * c1;
    const f2 = rt * c2 / r;

    return {
      a: f1 * I.a + f2 * M.a,
      b: f1 * I.b + f2 * M.b,
      c: f1 * I.c + f2 * M.c,
      d: f1 * I.d + f2 * M.d,
    };

  } else {
    // Real eigenvalues (Stretch/Shear case)
    const sqrtDelta = Math.sqrt(delta);
    const l1 = (trace - sqrtDelta) / 2;
    const l2 = (trace + sqrtDelta) / 2;
    
    // If eigenvalues are equal (shear only)
    if (Math.abs(l1 - l2) < EPS) {
       // M^t = l1^t * (I + t * (M/l1 - I))
       const lt = Math.pow(l1, t);
       const invL1 = 1/l1;
       
       // Term (M/l1 - I)
       const Ka = M.a * invL1 - 1;
       const Kb = M.b * invL1;
       const Kc = M.c * invL1;
       const Kd = M.d * invL1 - 1;

       return {
         a: lt * (1 + t * Ka),
         b: lt * (0 + t * Kb),
         c: lt * (0 + t * Kc),
         d: lt * (1 + t * Kd),
       };
    }

    // Distinct real eigenvalues
    // M^t = c1 * I + c2 * M
    const l1t = Math.pow(l1, t);
    const l2t = Math.pow(l2, t);
    const invDiff = 1 / (l2 - l1);

    const c1 = (l1t * l2 - l2t * l1) * invDiff;
    const c2 = (l2t - l1t) * invDiff;

    return {
      a: c1 + c2 * M.a,
      b: 0  + c2 * M.b,
      c: 0  + c2 * M.c,
      d: c1 + c2 * M.d,
    };
  }
}