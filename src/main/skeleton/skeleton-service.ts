import type { GenerateSkeletonInput, GenerateSkeletonResult, SkeletonComponentInfo } from '@shared/skeleton';
import type { ResolvedAi } from '../ai/chat';
import { listComponents } from './detect';
import { generateSkeleton } from './generator';
import { generateSkeletonWithAi } from './ai-generator';

/**
 * Public surface of the skeleton feature for the main process. Static-analysis mode is the default;
 * `runGenerateSkeletonAi` is the model-backed "Improve with AI" mode. Visual Match mode (rendering +
 * DOM measurement) can be added behind the same entry points.
 */

export function detectSkeletonComponents(filePath: string, code: string): SkeletonComponentInfo[] {
  return listComponents(filePath, code);
}

export function runGenerateSkeleton(input: GenerateSkeletonInput): GenerateSkeletonResult {
  return generateSkeleton(input);
}

export function runGenerateSkeletonAi(
  cfg: ResolvedAi,
  input: GenerateSkeletonInput,
): Promise<GenerateSkeletonResult> {
  return generateSkeletonWithAi(cfg, input);
}
