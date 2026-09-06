import {describe,expect,it} from 'vitest';
import {
  NavigationAgentConfigureSchema,NavigationMeshBakeSchema,NavigationMeshConfigureSchema,
  NavigationMeshSetOutlinesSchema,NavigationRegionConfigureSchema
} from '../src/navigation.js';

describe('navigation power-tool schemas',()=>{
  it('validates region costs and bounded semantic node paths',()=>{
    expect(NavigationRegionConfigureSchema.safeParse({node_path:'/Main/R',travel_cost:0}).success).toBe(false);
    expect(NavigationRegionConfigureSchema.safeParse({node_path:'/Main/R',enter_cost:0,travel_cost:1,navigation_layers:0xffffffff}).success).toBe(true);
    expect(NavigationMeshBakeSchema.safeParse({node_path:'/Main/R',source_root_path:`/${'x'.repeat(1024)}`}).success).toBe(false);
  });

  it('bounds 2D outline batches before mutation',()=>{
    expect(NavigationMeshSetOutlinesSchema.safeParse({
      node_path:'/Main/R',outlines:[[{x:0,y:0},{x:10,y:0},{x:10,y:10}]]
    }).success).toBe(true);
    const points=Array.from({length:4096},(_,i)=>({x:i,y:0}));
    expect(NavigationMeshSetOutlinesSchema.safeParse({node_path:'/Main/R',outlines:[points,points,[{x:0,y:0},{x:1,y:0},{x:0,y:1}]]}).success).toBe(false);
  });

  it('validates dimension-specific mesh and agent values at the protocol boundary',()=>{
    expect(NavigationMeshConfigureSchema.safeParse({node_path:'/Main/R',agent_max_slope:0}).success).toBe(false);
    expect(NavigationMeshConfigureSchema.safeParse({node_path:'/Main/R',sample_partition_type:'watershed'}).success).toBe(true);
    expect(NavigationAgentConfigureSchema.safeParse({node_path:'/Main/A',height:0}).success).toBe(false);
    expect(NavigationAgentConfigureSchema.safeParse({node_path:'/Main/A',avoidance_priority:1,max_neighbors:10}).success).toBe(true);
  });
});
