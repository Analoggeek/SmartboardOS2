#!/usr/bin/env python3
"""Regenerate the offline atlas using Natural Earth GeoJSON from the pinned source.
Run `python3 scripts/build-atlas.py /path/to/input` after fetching the six datasets below.
Data: public domain. Classroom maps are not official boundary definitions.
"""
import json
import sys
from pathlib import Path

SOURCE = 'https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19/geojson'
LAYERS = {'countries': 'admin_0_countries', 'states': 'admin_1_states_provinces', 'rivers': 'rivers_lake_centerlines',
          'lakes': 'lakes', 'regions': 'geography_regions_polys', 'elevation': 'geography_regions_elevation_points'}
ROOT = Path(__file__).resolve().parents[1]


def main(directory):
    def layer(key):
        full = directory / f'ne_50m_{LAYERS[key]}.geojson'
        path = full if full.exists() else directory / f'{key}.json'
        return json.loads(path.read_text())['features']

    def output(name, data):
        (ROOT / 'js' / f'map-{name}.js').write_text(f'/* Natural Earth 1:50m (public domain): {SOURCE} */\nexport default ' +
                                                  json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

    def line(points, tolerance=.018):
        clean = []
        for x, y, *_ in points:
            p = [round(x, 3), round(y, 3)]
            if not clean or (p[0]-clean[-1][0])**2 + (p[1]-clean[-1][1])**2 >= tolerance**2:
                clean.append(p)
        last = [round(v, 3) for v in points[-1][:2]]
        if clean[-1] != last:
            clean.append(last)
        if points[0] == points[-1] and len(clean) < 4:
            return [[round(x, 3), round(y, 3)] for x, y, *_ in points]
        return clean

    def polys(g, tolerance=.018):
        if not g:
            return []
        arr = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        return [[line(ring, tolerance) for ring in polygon] for polygon in arr]

    def lines(g):
        return [line(part, .033) for part in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates'])]

    def title(p):
        return p.get('NAME_EN') or p.get('name_en') or p.get('name') or p.get('NAME') or ''

    output('data', [[title(p), p['CONTINENT'], polys(f['geometry']), p['ADM0_A3']]
                     for f in layer('countries') if f['geometry'] for p in [f['properties']]])
    output('states', [[p['adm0_a3'], title(p), polys(f['geometry']), [p.get('longitude'), p.get('latitude')]]
                       for f in layer('states') if f['geometry'] for p in [f['properties']]])
    output('physical', {
        'rivers': [[title(p), p['scalerank'], lines(f['geometry'])] for f in layer('rivers') if f['geometry']
                   for p in [f['properties']] if p['featurecla'] == 'River'],
        'lakes': [[title(p), p['scalerank'], polys(f['geometry'], .045)] for f in layer('lakes') if f['geometry']
                  for p in [f['properties']]],
        'ranges': [[title(p), p['SCALERANK'], polys(f['geometry'], .085), p['FEATURECLA']]
                   for f in layer('regions') if f['geometry'] for p in [f['properties']]
                   if p['FEATURECLA'] in ('Range/mtn', 'Plateau', 'Desert', 'Plain')],
        'peaks': [[title(p), p['scalerank'], [round(v, 3) for v in f['geometry']['coordinates'][:2]], p.get('elevation')]
                  for f in layer('elevation') if f['geometry'] for p in [f['properties']] if str(p['featurecla']).lower() == 'mountain'],
    })


if __name__ == '__main__':
    main(Path(sys.argv[1]))
