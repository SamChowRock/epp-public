import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Draw the fixture locally. Only the two raster files are used as HTTP input.
const illustration = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360">
  <rect width="720" height="360" fill="#bde2e8"/>
  <circle cx="120" cy="83" r="34" fill="#ffc763"/>
  <path d="M0 216 Q110 174 207 219 T425 213 T720 214 V360 H0" fill="#748e89"/>
  <path d="M0 245 Q80 225 168 247 T359 240 T552 247 T720 240 V360 H0" fill="#357980"/>
  <path d="M0 285 Q80 267 160 286 T330 280 T500 285 T720 279" fill="none" stroke="#96cfc5" stroke-width="5"/>
  <path d="M222 283 L293 263 330 239 421 245 455 266 514 280 501 291 239 291Z" fill="#394c51"/>
  <path d="M335 125 H381 L398 249 H318Z" fill="#fff0cd"/>
  <path d="M330 161 H386 L389 182 H327Z M323 211 H393 L396 231 H320Z" fill="#bb4d3b"/>
  <rect x="337" y="96" width="42" height="31" fill="#3c4952"/>
  <rect x="344" y="100" width="11" height="22" fill="#ffd46b"/>
  <rect x="361" y="100" width="11" height="22" fill="#ffd46b"/>
  <path d="M327 97 L358 72 389 97Z" fill="#bb4d3b"/>
  <path d="M329 128 H387" stroke="#323e47" stroke-width="7"/>
  <path d="M349 249 V230 Q358 219 367 230 V249Z" fill="#394c51"/>
  <path d="M581 224 H644 L633 235 H592Z" fill="#713f35"/>
  <path d="M610 220 V176 L583 220Z" fill="#fff0cd"/>
</svg>`);
await sharp(illustration).png().toFile(fileURLToPath(new URL('harbor.png', import.meta.url)));
await sharp(illustration).jpeg({ quality: 89 }).toFile(fileURLToPath(new URL('harbor.jpg', import.meta.url)));
