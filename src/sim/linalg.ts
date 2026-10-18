// Dense LU solve with partial pivoting. Circuits here are small (tens of unknowns),
// so a dense row-major matrix is simpler and fast enough.

export class SingularMatrixError extends Error {
  constructor(public row: number) {
    super(`Singular matrix at row ${row}`);
  }
}

/** Solves A·x = b in place. `A` is n×n row-major and is destroyed; result is written to `b`. */
export function solveInPlace(A: Float64Array, b: Float64Array, n: number): void {
  for (let k = 0; k < n; k++) {
    let piv = k;
    let max = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > max) {
        max = v;
        piv = i;
      }
    }
    if (max < 1e-18) throw new SingularMatrixError(k);
    if (piv !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = A[k * n + j];
        A[k * n + j] = A[piv * n + j];
        A[piv * n + j] = tmp;
      }
      const tb = b[k];
      b[k] = b[piv];
      b[piv] = tb;
    }
    const akk = A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / akk;
      if (f === 0) continue;
      A[i * n + k] = 0;
      for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      b[i] -= f * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j];
    b[i] = s / A[i * n + i];
  }
}
