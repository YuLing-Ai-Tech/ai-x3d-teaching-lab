import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";

const atlas = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"));
const collection = feature(atlas, atlas.objects.countries);
const selected = collection.features.filter((entry) => ["156", "158"].includes(String(entry.id).padStart(3, "0")));

if (selected.length !== 2) {
  throw new Error(`Expected China and Taiwan display geometries, found ${selected.length}`);
}

const output = {
  type: "FeatureCollection",
  source: "Natural Earth via world-atlas 2.0.2; public-domain source generalized for teaching display",
  disclaimer: "教学空间示意，不作为行政区划、边界或测绘依据",
  features: selected,
};

writeFileSync("public/data/china-outline.json", JSON.stringify(output));
console.log(`wrote public/data/china-outline.json with ${selected.length} display geometries`);
