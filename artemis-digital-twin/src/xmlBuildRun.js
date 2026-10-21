const INCH_TO_MM = 25.4;

function text(parent, selector) {
  return parent.querySelector(selector)?.textContent?.trim() ?? '';
}

export function parseArtaicProjectXml(xml) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parseError = document.querySelector('parsererror');
  if (parseError) throw new Error('Invalid Artaic project XML.');

  const project = document.querySelector('ArtaicProject');
  const grid = project?.querySelector('grid');
  if (!project || !grid) throw new Error('The XML does not contain an Artaic project grid.');

  const tilesPerRow = Number(text(grid, 'tilesPerRow'));
  const tileSpacing = Number(text(grid, 'spacing')) * INCH_TO_MM;
  const tileSize = Number(text(grid, 'tiles_size')) * INCH_TO_MM;
  const palette = new Map(Array.from(project.querySelectorAll('colors > color'))
    .filter((color) => color.getAttribute('index') !== '*')
    .map((color, lane) => [color.getAttribute('index'), {
      lane,
      sku: text(color, 'tile_ID'),
      color: `rgb(${text(color, 'R')}, ${text(color, 'G')}, ${text(color, 'B')})`,
    }]));

  const base = {
    id: text(project, 'header > proj_ID'),
    projectName: text(project, 'header > name'),
    geometry: text(grid, 'name'),
    tileSize, tileSpacing, tilesPerRow,
    feederLanes: Array.from(palette.values()),
  };
  const sections = Array.from(project.querySelectorAll('sections > section')).map((section, sectionIndex) => {
    const placements = [];
    text(section, 'indices').split(',').forEach((index, cellIndex) => {
      const tile = palette.get(index.trim());
      if (!tile) return;
      placements.push({
        sourceIndex: placements.length, lane: tile.lane,
        x: (cellIndex % tilesPerRow) * tileSpacing,
        y: Math.floor(cellIndex / tilesPerRow) * tileSpacing,
        theta: 0, sku: tile.sku, color: tile.color,
      });
    });
    return { ...base, id: `${base.id}-${sectionIndex + 1}`, sectionName: String(sectionIndex + 1), placements };
  });
  if (!sections.length) throw new Error('The XML contains no build sections.');
  return Object.freeze({ ...sections[0], sections });
}

export async function loadRubixRougeSample() {
  const response = await fetch(`${import.meta.env.BASE_URL}samples/Rubix_Rouge01.xml`);
  if (!response.ok) throw new Error(`Unable to load sample XML (${response.status}).`);
  return parseArtaicProjectXml(await response.text());
}
