import * as CANNON from "cannon-es";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const { buildDieModel, topFaceValue } = await vite.ssrLoadModule("/src/lib/dice-shapes.tsx");
  const sideCounts = [4, 6, 8, 10, 12, 20];
  const summaries = [];

  for (const sides of sideCounts) {
    const model = buildDieModel(sides);
    if (model.faces.length !== sides) {
      throw new Error(`d${sides}: geometria expõe ${model.faces.length} faces`);
    }

    const observed = new Set();
    for (let trial = 0; trial < 8; trial++) {
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12.5, 0) });
      const floor = new CANNON.Body({ mass: 0 });
      floor.addShape(new CANNON.Plane());
      floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      world.addBody(floor);

      const body = new CANNON.Body({
        mass: 1,
        linearDamping: 0.13,
        angularDamping: 0.12,
      });
      body.addShape(model.shape);
      body.position.set(0, 3.2 + trial * 0.08, 0);
      body.quaternion.setFromEuler(0.71 * trial + 0.2, 1.13 * trial + 0.4, 0.47 * trial + 0.8);
      body.velocity.set(0.3 - trial * 0.04, 1.8, 0.7);
      body.angularVelocity.set(7 + trial, -9 + trial * 0.4, 5 + trial * 0.7);
      world.addBody(body);

      for (let frame = 0; frame < 600; frame++) world.step(1 / 60);
      const value = topFaceValue(model.faces, body.quaternion);
      if (!Number.isInteger(value) || value < 1 || value > sides) {
        throw new Error(`d${sides}: leitura inválida ${value}`);
      }
      observed.add(value);
    }

    model.geo.dispose();
    summaries.push(`d${sides} OK (${[...observed].sort((a, b) => a - b).join(", ")})`);
  }

  console.log(summaries.join("\n"));
} finally {
  await vite.close();
}
