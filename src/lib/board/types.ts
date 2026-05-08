export type ShapeType = "rect" | "ellipse" | "sticky" | "text" | "stroke";

export interface BaseShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  text?: string;
}

export interface StrokeShape extends BaseShape {
  type: "stroke";
  points: number[]; // flat [x,y,x,y,...]
  strokeWidth: number;
}

export type AnyShape = BaseShape | StrokeShape;

export interface CursorState {
  x: number;
  y: number;
  name: string;
  color: string;
  userId: string;
}