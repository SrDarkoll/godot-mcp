import {z} from 'zod/v4';

export const UiLayoutPresetSchema=z.enum([
  'top_left','center_top','top_right','center_left','center','center_right','bottom_left','center_bottom','bottom_right',
  'left_wide','top_wide','right_wide','bottom_wide','vcenter_wide','hcenter_wide','full_rect'
]);
export type UiLayoutPreset=z.infer<typeof UiLayoutPresetSchema>;

export const UiLayoutResizeModeSchema=z.enum(['min_size','keep_width','keep_height','keep_size']);
export type UiLayoutResizeMode=z.infer<typeof UiLayoutResizeModeSchema>;

export const UiSideSchema=z.enum(['left','top','right','bottom']);
export type UiSide=z.infer<typeof UiSideSchema>;

export const UiSizeFlagSchema=z.enum(['fill','expand','shrink_center','shrink_end']);
export type UiSizeFlag=z.infer<typeof UiSizeFlagSchema>;

export interface UiRectValue{ x:number; y:number; width:number; height:number; }
export interface UiVector2Value{ x:number; y:number; }
export interface UiEdges{ left:number; top:number; right:number; bottom:number; }
export interface UiFocusNeighbors{ left:string|null; top:string|null; right:string|null; bottom:string|null; }

export interface UiLayoutResult{
  node_path:string;
  type:string;
  parent_type:string|null;
  container_managed:boolean;
  rect:UiRectValue;
  global_rect:UiRectValue;
  anchors:UiEdges;
  offsets:UiEdges;
  custom_minimum_size:UiVector2Value;
  minimum_size:UiVector2Value;
  size_flags_horizontal:UiSizeFlag[];
  size_flags_vertical:UiSizeFlag[];
  size_flags_stretch_ratio:number;
  focus_neighbors:UiFocusNeighbors;
}

export interface UiMutationResult{ node_path:string; layout:UiLayoutResult; }
