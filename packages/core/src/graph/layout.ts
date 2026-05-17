import { GraphNode } from './types';

export function layoutNodes(nodes: GraphNode[]): GraphNode[] {
  const sorted = [...nodes].sort((a, b) =>
    b.importedByCount - a.importedByCount
    || b.importCount - a.importCount
    || a.relativePath.localeCompare(b.relativePath),
  );

  const layers = createLayers(sorted);
  const width = 640;
  const rowHeight = 110;
  const startY = 60;

  return layers.flatMap((layer, layerIndex) =>
    layer.map((node, nodeIndex) => ({
      ...node,
      position: {
        x: (width / (layer.length + 1)) * (nodeIndex + 1),
        y: startY + layerIndex * rowHeight,
      },
    })),
  );
}

function createLayers(nodes: GraphNode[]): GraphNode[][] {
  const sizes = [2, 4, 5, Number.MAX_SAFE_INTEGER];
  const layers: GraphNode[][] = [];
  let index = 0;

  for (const size of sizes) {
    const slice = nodes.slice(index, index + size);
    if (slice.length === 0) break;
    layers.push(slice);
    index += size;
  }

  return layers;
}
