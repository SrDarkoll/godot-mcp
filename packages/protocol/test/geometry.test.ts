import { expect, it } from 'vitest';
import { GeometryValidateSchema } from '../src/geometry.js';

it('bounds route, obstacle and endpoint validation requests', () => {
  const request={
    routes:['/Main/CentralCross','/Main/Link'],
    obstacles:['/Main/academic_block_unidentified/Collision'],
    connections:[{from:'/Main/CentralCross',from_end:'end',to:'/Main/Link',to_end:'start',max_gap_px:10}]
  };
  expect(GeometryValidateSchema.parse(request)).toMatchObject({
    agent_radius_px:0,max_findings:100,connections:request.connections
  });
  for(const invalid of [
    {...request,routes:[]},
    {...request,obstacles:[]},
    {...request,agent_radius_px:-1},
    {...request,max_findings:201},
    {...request,connections:[{...request.connections[0],max_gap_px:-1}]},
    {...request,routes:['/Main/../Outside']}
  ]) expect(GeometryValidateSchema.safeParse(invalid).success).toBe(false);
});

it('accepts scene-root-relative node paths already supported by the Godot scene resolver', () => {
  const request = GeometryValidateSchema.parse({
    routes: ['CentralCross', 'Paths/EntranceLink'],
    obstacles: ['academic_block_unidentified/Collision'],
    connections: [{
      from: 'CentralCross', from_end: 'end',
      to: 'Paths/EntranceLink', to_end: 'start', max_gap_px: 10
    }]
  });
  expect(request.routes).toEqual(['CentralCross', 'Paths/EntranceLink']);
  expect(request.obstacles).toEqual(['academic_block_unidentified/Collision']);
  expect(GeometryValidateSchema.safeParse({
    routes: ['../Outside'], obstacles: ['academic_block_unidentified/Collision']
  }).success).toBe(false);
});
