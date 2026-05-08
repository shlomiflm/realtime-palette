import type { AnyShape } from "./types";
import { nanoid } from "nanoid";

export function templateShapes(template: string | null): AnyShape[] {
  if (template === "kanban") {
    return ["To do", "Doing", "Done"].map((label, i) => ({
      id: nanoid(8), type: "rect", x: 100 + i * 320, y: 120, w: 280, h: 500,
      fill: ["#fef3c7", "#dbeafe", "#dcfce7"][i], stroke: "#94a3b8", text: label,
    } as AnyShape));
  }
  if (template === "mindmap") {
    return [
      { id: nanoid(8), type: "ellipse", x: 400, y: 280, w: 200, h: 100, fill: "#ede9fe", stroke: "#8b5cf6", text: "Main idea" } as AnyShape,
    ];
  }
  if (template === "retro") {
    return ["What went well", "What didn't", "Action items"].map((label, i) => ({
      id: nanoid(8), type: "rect", x: 80 + i * 340, y: 120, w: 300, h: 480,
      fill: ["#dcfce7", "#fee2e2", "#dbeafe"][i], stroke: "#94a3b8", text: label,
    } as AnyShape));
  }
  return [];
}