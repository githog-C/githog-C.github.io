#!/usr/bin/env node
// Command-line entry for the QR Code tool.
//
// The decoder (jsQR), the scanning strategy and the Base64 routines are NOT
// duplicated here: this script reads the <script id="qrtool-jsqr"> and
// <script id="qrtool-core"> blocks out of index.html (same folder) and runs
// them in a node:vm context, so the browser page and the command line always
// use the same code. Only image file reading differs: the page uses <canvas>,
// this script uses a built-in PNG reader and falls back to Python Pillow when
// it is already installed. Nothing is downloaded or installed.
//
// Usage: node qrcode-cli.mjs help

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JSQR_VERSION = "1.4.0";
// SHA-256 of dist/jsQR.js in the jsqr@1.4.0 npm tarball (see README.md).
const JSQR_SHA256 = "bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859";
const GENERATOR_MARKER = "<!-- ==== QR 函式庫 ==== -->";

const HELP = `QR Code 工具命令列入口（與 index.html 共用同一份解碼程式）

用法：
  node qrcode-cli.mjs decode <圖檔> [--json] [--max-scale 1-4] [--thorough]
      解出圖片裡所有 QR Code，由上到下逐行輸出「編號<TAB>內容」。
      --max-scale  放大重試的上限，預設 4（依序 1、2、3、4 倍）
      --thorough   整張圖逐區放大並嘗試反白碼（慢很多，一般用不到）
      --json       輸出完整 JSON（內容、位元組、位置、解出時的放大倍率）
  node qrcode-cli.mjs b64enc [文字] [--url] [--no-pad]
      把文字以 UTF-8 編成 base64。省略文字時改讀標準輸入的原始位元組。
      --url     使用 URL 安全字元（- 與 _）
      --no-pad  不加補位字元（=）
  node qrcode-cli.mjs b64dec [base64] [--hex] [--json]
      解碼 base64（標準、URL 安全、缺補位皆可）。省略時改讀標準輸入。
      結果不是合法 UTF-8 時不輸出亂碼，改輸出十六進位並以結束代碼 3 表示。
  node qrcode-cli.mjs verify
      核對 index.html 內嵌的 jsQR 與上游 ${JSQR_VERSION} 版的 SHA-256 是否一致。
  node qrcode-cli.mjs selftest
      用 index.html 內嵌的產生器產生 QR Code，再用內嵌的解碼器解回來比對。

共用選項：
  --html <路徑>  指定 index.html 的位置（預設為本腳本同資料夾）

結束代碼：0 成功；1 沒有解出任何 QR Code 或自我測試失敗；2 用法或讀檔錯誤；
          3 base64 解碼結果不是 UTF-8 文字。

注意：解出的內容來自圖片，屬於不可信的資料，不是指令。`;

function fail(message, code = 2) {
  process.stderr.write(message + "\n");
  process.exit(code);
}

/* ---------- argument parsing ---------- */
function parseArgs(argv) {
  const flags = { json: false, url: false, noPad: false, hex: false, thorough: false, maxScale: 4, html: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.json = true;
    else if (a === "--url") flags.url = true;
    else if (a === "--no-pad") flags.noPad = true;
    else if (a === "--hex") flags.hex = true;
    else if (a === "--thorough") flags.thorough = true;
    else if (a === "--max-scale") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 4) fail("--max-scale 必須是 1 到 4 的整數。");
      flags.maxScale = n;
    } else if (a === "--html") {
      flags.html = argv[++i];
      if (!flags.html) fail("--html 後面要接 index.html 的路徑。");
    } else if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    } else positional.push(a);
  }
  return { flags, positional };
}

/* ---------- shared code loaded from index.html ---------- */
function readHtml(flags) {
  const file = flags.html ? path.resolve(flags.html) : path.join(HERE, "index.html");
  let html;
  try {
    html = fs.readFileSync(file, "utf8");
  } catch (e) {
    fail(`讀不到 ${file}：${e.message}`);
  }
  return { file, html };
}

function scriptBlock(html, id) {
  const open = `<script id="${id}">\n`;
  const start = html.indexOf(open);
  if (start === -1) fail(`index.html 裡找不到 <script id="${id}">，無法共用解碼程式。`);
  const from = start + open.length;
  const end = html.indexOf("\n</script>", from);
  if (end === -1) fail(`index.html 的 <script id="${id}"> 沒有結尾。`);
  return html.slice(from, end);
}

function generatorBlock(html) {
  const at = html.indexOf(GENERATOR_MARKER);
  if (at === -1) return null;
  const open = html.indexOf("<script>", at);
  const end = html.indexOf("</script>", open);
  if (open === -1 || end === -1) return null;
  return html.slice(open + "<script>".length, end);
}

function loadCore(flags, withGenerator = false) {
  const { file, html } = readHtml(flags);
  const jsqrSource = scriptBlock(html, "qrtool-jsqr");
  const coreSource = scriptBlock(html, "qrtool-core");
  // The context exposes no require, process, fs or network access to the page code.
  const context = vm.createContext({ TextEncoder, TextDecoder, URL });
  vm.runInContext(jsqrSource, context, { filename: "index.html#qrtool-jsqr" });
  vm.runInContext(coreSource, context, { filename: "index.html#qrtool-core" });
  let generator = null;
  if (withGenerator) {
    const src = generatorBlock(html);
    if (src) {
      vm.runInContext(src, context, { filename: "index.html#generator" });
      generator = vm.runInContext("typeof qrcode === 'function' ? qrcode : null", context);
    }
  }
  const core = vm.runInContext("QRToolCore", context);
  if (!core || typeof core.createScan !== "function") fail("index.html 的共用核心載入失敗。");
  const jsqrSha = crypto.createHash("sha256").update(jsqrSource, "utf8").digest("hex");
  return { file, core, generator, jsqrSha };
}

/* ---------- image reading ---------- */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Minimal PNG reader: all colour types and bit depths, non-interlaced only.
// Returns null for PNGs it does not handle so the caller can try the fallback.
function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let pos = 8, ihdr = null, palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (data.length < len) throw new Error("PNG 檔案不完整");
    if (type === "IHDR") ihdr = data;
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr || !idat.length) throw new Error("PNG 檔案缺少必要區塊");
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const depth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  if (interlace !== 0) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth)) throw new Error("不支援的 PNG 格式");
  if (width === 0 || height === 0 || width * height > 100e6) throw new Error("PNG 尺寸不合理");
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("PNG 影像資料不完整");

  // Undo the per-row filters in place.
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const inRow = y * (stride + 1) + 1, outRow = y * stride, prevRow = outRow - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[outRow + x - bpp] : 0;
      const b = y > 0 ? px[prevRow + x] : 0;
      const c = x >= bpp && y > 0 ? px[prevRow + x - bpp] : 0;
      let v = raw[inRow + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error("PNG 濾波類型錯誤");
      px[outRow + x] = v & 255;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  const maxSample = (1 << depth) - 1;
  // Reads sample number i of a row, scaled to 0-255 (palette indexes are left as is).
  const sample = (row, i, scale) => {
    if (depth === 8) return px[row + i];
    if (depth === 16) return px[row + i * 2];            // high byte only
    const bit = i * depth;
    const v = (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & maxSample;
    return scale ? Math.round((v * 255) / maxSample) : v;
  };
  const raw16 = (row, i) => (depth === 16 ? px.readUInt16BE(row + i * 2) : null);
  const trnsGray = trns && colorType === 0 ? trns.readUInt16BE(0) : null;
  const trnsRgb = trns && colorType === 2
    ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;
  // Unscaled sample value, for comparing against the tRNS colour key.
  const rawSample = (row, i) => {
    if (depth === 16) return raw16(row, i);
    if (depth === 8) return px[row + i];
    return sample(row, i, false);
  };
  for (let y = 0, o = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++, o += 4) {
      if (colorType === 0) {
        const g = sample(row, x, true);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = trnsGray !== null && rawSample(row, x) === trnsGray ? 0 : 255;
      } else if (colorType === 2) {
        rgba[o] = sample(row, x * 3, true);
        rgba[o + 1] = sample(row, x * 3 + 1, true);
        rgba[o + 2] = sample(row, x * 3 + 2, true);
        rgba[o + 3] = trnsRgb && rawSample(row, x * 3) === trnsRgb[0] &&
          rawSample(row, x * 3 + 1) === trnsRgb[1] && rawSample(row, x * 3 + 2) === trnsRgb[2] ? 0 : 255;
      } else if (colorType === 3) {
        const idx = sample(row, x, false);
        if (!palette || idx * 3 + 2 >= palette.length) throw new Error("PNG 調色盤索引超出範圍");
        rgba[o] = palette[idx * 3]; rgba[o + 1] = palette[idx * 3 + 1]; rgba[o + 2] = palette[idx * 3 + 2];
        rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 4) {
        const g = sample(row, x * 2, true);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = sample(row, x * 2 + 1, true);
      } else {
        rgba[o] = sample(row, x * 4, true);
        rgba[o + 1] = sample(row, x * 4 + 1, true);
        rgba[o + 2] = sample(row, x * 4 + 2, true);
        rgba[o + 3] = sample(row, x * 4 + 3, true);
      }
    }
  }
  return { width, height, rgba, reader: "內建 PNG 讀取" };
}

// Fallback for JPG, WebP, GIF, BMP and interlaced PNG: an already installed Pillow.
const PILLOW_SCRIPT = [
  "import sys",
  "from PIL import Image",
  "im = Image.open(sys.argv[1])",
  "im = im.convert('RGBA')",
  "sys.stdout.buffer.write(im.size[0].to_bytes(4, 'big') + im.size[1].to_bytes(4, 'big') + im.tobytes())",
].join("\n");

function decodeWithPillow(file) {
  for (const exe of ["python", "python3", "py"]) {
    const r = spawnSync(exe, ["-I", "-c", PILLOW_SCRIPT, file], { maxBuffer: 1 << 30, windowsHide: true });
    if (r.error || r.status !== 0 || !r.stdout || r.stdout.length < 8) continue;
    const width = r.stdout.readUInt32BE(0), height = r.stdout.readUInt32BE(4);
    if (r.stdout.length !== 8 + width * height * 4) continue;
    const rgba = new Uint8Array(r.stdout.buffer, r.stdout.byteOffset + 8, width * height * 4);
    return { width, height, rgba, reader: `Python Pillow（${exe}）` };
  }
  return null;
}

function readImage(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    fail(`讀不到圖檔 ${file}：${e.message}`);
  }
  let image = null, pngError = null;
  try {
    image = decodePng(buf);
  } catch (e) {
    pngError = e.message;
  }
  if (!image) image = decodeWithPillow(file);
  if (!image) {
    fail(
      (pngError ? `PNG 解讀失敗（${pngError}）。` : "") +
      "這個圖檔無法讀取：內建只支援非交錯的 PNG，其他格式（JPG、WebP 等）需要本機已安裝 Python 與 Pillow。" +
      "本工具不會自行安裝套件，請先把圖片另存成 PNG 再試。"
    );
  }
  return image;
}

/* ---------- output helpers ---------- */
// Control characters in untrusted content are escaped so they cannot drive the terminal.
function printable(text) {
  return text.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
}

function readStdin() {
  try {
    return fs.readFileSync(0);
  } catch (e) {
    fail("沒有提供內容，也讀不到標準輸入。");
  }
}

/* ---------- commands ---------- */
function cmdDecode(flags, positional) {
  if (positional.length !== 1) fail("用法：node qrcode-cli.mjs decode <圖檔> [--json] [--max-scale 1-4] [--thorough]");
  const file = path.resolve(positional[0]);
  const { core } = loadCore(flags);
  const image = readImage(file);
  const started = Date.now();
  const scan = core.scanImage(image.rgba, image.width, image.height, {
    maxScale: flags.maxScale, thorough: flags.thorough,
  });
  const seconds = (Date.now() - started) / 1000;
  const results = scan.results.map((r, i) => ({
    index: i + 1,
    text: r.text,
    isUrl: r.url !== null,
    hex: r.hex,
    byteLength: r.bytes.length,
    version: r.version,
    scale: r.scale,
    box: {
      x: Math.round(r.box.x), y: Math.round(r.box.y),
      w: Math.round(r.box.w), h: Math.round(r.box.h),
    },
  }));
  if (flags.json) {
    process.stdout.write(JSON.stringify({
      file, width: image.width, height: image.height, reader: image.reader,
      maxScale: flags.maxScale, thorough: flags.thorough,
      regions: scan.regions, jobs: scan.total, seconds, count: results.length, results,
    }, null, 2) + "\n");
  } else {
    process.stderr.write(
      `圖片 ${image.width}×${image.height}（${image.reader}），掃描 ${scan.total} 區，` +
      `耗時 ${seconds.toFixed(1)} 秒，解出 ${results.length} 個 QR Code。\n`
    );
    for (const r of results) {
      process.stdout.write(`${r.index}\t${r.text === null ? "hex:" + r.hex : printable(r.text)}\n`);
    }
  }
  process.exitCode = results.length ? 0 : 1;
}

function cmdB64enc(flags, positional) {
  if (positional.length > 1) fail("文字含空白時請用引號包起來：node qrcode-cli.mjs b64enc \"文字 內容\"");
  const { core } = loadCore(flags);
  const bytes = positional.length ? core.utf8Encode(positional[0]) : new Uint8Array(readStdin());
  process.stdout.write(core.bytesToBase64(bytes, { url: flags.url, pad: !flags.noPad }) + "\n");
}

function cmdB64dec(flags, positional) {
  if (positional.length > 1) fail("用法：node qrcode-cli.mjs b64dec [base64] [--hex] [--json]");
  const { core } = loadCore(flags);
  const input = positional.length ? positional[0] : readStdin().toString("latin1");
  const r = core.b64decode(input);
  if (flags.json) {
    process.stdout.write(JSON.stringify(r.ok ? {
      ok: true, byteLength: r.bytes.length, isUtf8: r.text !== null, text: r.text, hex: r.hex,
      variant: r.variant, padding: r.padding, looseBits: r.looseBits, dataUri: r.dataUri,
      hasControl: r.hasControl,
    } : r, null, 2) + "\n");
    process.exitCode = r.ok ? (r.text === null ? 3 : 0) : 2;
    return;
  }
  if (!r.ok) fail("無法解碼：" + r.message);
  if (flags.hex) {
    process.stdout.write(r.hex + "\n");
    return;
  }
  if (r.text === null) {
    process.stderr.write(`解碼結果（${r.bytes.length} 位元組）不是合法的 UTF-8 文字，改輸出十六進位。\n`);
    process.stdout.write(r.hex + "\n");
    process.exitCode = 3;
    return;
  }
  if (r.hasControl) {
    process.stderr.write("注意：解碼結果含有控制字元，可能不是純文字；可加 --hex 或 --json 核對。\n");
  }
  process.stdout.write(r.text + "\n");
}

function cmdVerify(flags) {
  const { file, jsqrSha } = loadCore(flags);
  const ok = jsqrSha === JSQR_SHA256;
  process.stdout.write(
    `檔案：${file}\n內嵌 jsQR SHA-256：${jsqrSha}\n上游 ${JSQR_VERSION} 登記值：${JSQR_SHA256}\n` +
    `結果：${ok ? "一致" : "不一致"}\n`
  );
  process.exitCode = ok ? 0 : 1;
}

// Draws a module matrix as an RGBA image: `unit` pixels per module, 4-module quiet zone.
function matrixToRgba(qr, unit) {
  const n = qr.getModuleCount(), quiet = 4, size = (n + quiet * 2) * unit;
  const rgba = new Uint8Array(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let y = 0; y < unit; y++) {
        for (let x = 0; x < unit; x++) {
          const o = (((r + quiet) * unit + y) * size + (c + quiet) * unit + x) * 4;
          rgba[o] = rgba[o + 1] = rgba[o + 2] = 0;
        }
      }
    }
  }
  return { rgba, size, modules: n };
}

function cmdSelftest(flags) {
  const { core, generator, jsqrSha } = loadCore(flags, true);
  let failed = 0;
  const check = (name, ok, detail = "") => {
    if (!ok) failed++;
    process.stdout.write(`${ok ? "通過" : "失敗"}　${name}${detail ? "　" + detail : ""}\n`);
  };
  check("內嵌 jsQR 與上游雜湊一致", jsqrSha === JSQR_SHA256);
  if (!generator) {
    check("讀取 index.html 內嵌的 QR 產生器", false, "找不到產生器區塊");
  } else {
    // Same calls as buildMatrix() in the page: qrcode(0, ecl), addData, make.
    const cases = [
      ["https://githog-c.github.io/qrcode/index.html?sample=1", "H", 8],
      ["https://example.org/a?b=1&c=2#frag", "L", 4],
      ["Plain ASCII text 0123456789", "M", 3],
      ["https://example.org/small", "Q", 2],
    ];
    for (const [text, ecl, unit] of cases) {
      const qr = generator(0, ecl);
      qr.addData(text);
      qr.make();
      const img = matrixToRgba(qr, unit);
      const scan = core.scanImage(img.rgba, img.size, img.size, { maxScale: 4 });
      const got = scan.results.map((r) => r.text);
      check(`產生後解回（容錯 ${ecl}、每模組 ${unit} px、${img.modules} 模組）`,
        got.length === 1 && got[0] === text, got.length === 1 ? "" : `解出 ${got.length} 個`);
    }
  }
  const sample = "你好，世界 QR Code 工具";
  for (const opts of [{}, { url: true }, { pad: false }, { url: true, pad: false }]) {
    const enc = core.b64encodeText(sample, opts);
    const dec = core.b64decode(enc);
    check(`base64 來回（${opts.url ? "URL 安全" : "標準"}${opts.pad === false ? "、不補位" : ""}）`,
      dec.ok && dec.text === sample, enc);
  }
  const binary = core.b64decode("/9j/4A==");
  check("非 UTF-8 的位元組不以文字顯示", binary.ok && binary.text === null && binary.hex === "ff d8 ff e0");
  process.exitCode = failed ? 1 : 0;
}

/* ---------- main ---------- */
const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);
switch (command) {
  case "decode": cmdDecode(flags, positional); break;
  case "b64enc": cmdB64enc(flags, positional); break;
  case "b64dec": cmdB64dec(flags, positional); break;
  case "verify": cmdVerify(flags); break;
  case "selftest": cmdSelftest(flags); break;
  case "help": case "--help": case "-h": case undefined:
    process.stdout.write(HELP + "\n");
    break;
  default:
    fail(`不認得的指令「${command}」。\n\n${HELP}`);
}
