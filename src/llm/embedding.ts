import { pipeline, env } from '@huggingface/transformers';

// 使用 HF 镜像（国内网络）
if (process.env.HF_ENDPOINT) {
  env.remoteHost = process.env.HF_ENDPOINT;
}

type FeatureExtractor = Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>;

let extractor: FeatureExtractor | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (extractor) return extractor;
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'fp32',
  });
  return extractor;
}

/**
 * 将文本转为向量（384 维）
 */
export async function embed(text: string): Promise<Float32Array> {
  const ext = await getExtractor();
  const result = await ext(text, { pooling: 'mean', normalize: true });
  return new Float32Array(Array.from(result.data as ArrayLike<number>));
}

/**
 * 批量将文本转为向量
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const ext = await getExtractor();
  const results: Float32Array[] = [];
  for (const text of texts) {
    const result = await ext(text, { pooling: 'mean', normalize: true });
    results.push(new Float32Array(Array.from(result.data as ArrayLike<number>)));
  }
  return results;
}
