import { A } from './esm-a.mjs';

if (process.argv[2] === 'eager') console.log(A);

export function readA() {
  return A;
}
