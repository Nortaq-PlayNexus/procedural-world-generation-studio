import { BASE_CONFIG } from '../src/lib/presets';
import { generateWorldAsync } from '../src/lib/worldgen';
import { encodeHeights, decodeHeights, terrainPatchBytes } from '../src/lib/terrainCodec';
const w = await generateWorldAsync({...BASE_CONFIG, resolution: 320});
const patch = encodeHeights(w.heights)!;
const decoded = decodeHeights(patch)!;
let max = 0; for (let i=0;i<decoded.length;i++) max = Math.max(max, Math.abs(decoded[i]-w.heights[i]));
console.log('patch', patch.resolution, patch.count, 'bytes', (terrainPatchBytes(patch)/1024).toFixed(0)+'KiB', 'maxErr', max.toFixed(5), 'step', ((patch.max-patch.min)/65535).toFixed(5));
console.log('corrupt rejected', decodeHeights({...patch, data: 'AAAA'}) === null, 'null rejected', decodeHeights(null as never) === null);
