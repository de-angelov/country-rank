#!/usr/bin/env node
/* global console */
import { mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import sharp from "sharp";

const sourcePath = "public/images/country-ranking-banner-v7.png";
const outputDirectory = "public/images/banner";
const widths = [960, 1600, 2400];
const formats = [
  { extension: "avif", options: { quality: 55 } },
  { extension: "webp", options: { quality: 78 } },
  { extension: "png", options: { compressionLevel: 9, palette: true } },
];

const sourceBaseName = basename(sourcePath, extname(sourcePath));

await mkdir(outputDirectory, { recursive: true });

const sourceImage = sharp(sourcePath);
const metadata = await sourceImage.metadata();

if (!metadata.width) {
  throw new Error(`Could not read source image width from ${sourcePath}.`);
}

const generatedFiles = await Promise.all(
  widths
    .filter((width) => width <= metadata.width)
    .flatMap((width) =>
      formats.map(async ({ extension, options }) => {
        const outputPath = join(
          outputDirectory,
          `${sourceBaseName}-${width}.${extension}`,
        );

        await sharp(sourcePath)
          .resize({ width, withoutEnlargement: true })
          .toFormat(extension, options)
          .toFile(outputPath);

        return outputPath;
      }),
    ),
);

console.log(`Generated ${generatedFiles.length} banner asset(s):`);
for (const filePath of generatedFiles.sort()) {
  console.log(`- ${filePath}`);
}
