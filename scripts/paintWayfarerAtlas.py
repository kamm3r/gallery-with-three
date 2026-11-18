"""Paint the Wayfarer's 256 px diffuse atlas. Run with uv run --with pillow."""
from math import cos, pi, sin
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
rng = Random(74)
atlas = Image.new("RGB", (256, 256))
palette = [
    (155, 127, 108), (54, 58, 65), (66, 63, 60), (72, 55, 48),
    (57, 59, 67), (93, 85, 79), (99, 51, 48), (80, 61, 51),
    (61, 44, 38), (143, 121, 88), (57, 58, 64), (91, 72, 56),
    (54, 58, 65), (126, 114, 92), (89, 90, 88), (75, 55, 68),
]


def tint(color, factor):
    return tuple(min(255, round(channel * factor)) for channel in color)


for tile, base in enumerate(palette):
    island = Image.new("RGB", (64, 64))
    draw = ImageDraw.Draw(island)
    for y in range(64):
        for x in range(64):
            fold = cos(x * .39 + sin(y * .095) * .9)
            grain = rng.uniform(-.034, .034)
            value = .91 + .12 * cos((x / 64 - .49) * 2 * pi)
            value += .13 * (1 - y / 64) + .062 * fold + grain
            if tile == 0:
                value = .77 + .24 * sin(pi * x / 64) + .14 * (1 - y / 64) + grain
            island.putpixel((x, y), tint(base, value))

    def line(points, factor, width=1):
        draw.line(points, fill=tint(base, factor), width=width)

    def patch(points, factor):
        draw.polygon(points, fill=tint(base, factor))

    if tile == 0:
        # Eyes, facial hair and expression follow the face mesh's own UV island.
        patch([(4, 37), (13, 42), (23, 47), (41, 47), (53, 41), (60, 37),
               (59, 58), (45, 63), (19, 63), (6, 56)], .55)
        patch([(11, 18), (20, 13), (29, 19), (28, 23), (17, 20)], .57)
        patch([(35, 18), (45, 14), (54, 19), (52, 22), (42, 20), (35, 22)], .57)
        for x in (16, 39):
            draw.polygon([(x, 25), (x+5, 23), (x+12, 24), (x+12, 28),
                          (x+3, 29)], fill=(74, 47, 39))
            draw.line((x+2, 26, x+10, 26), fill=(163, 147, 120), width=2)
            draw.rectangle((x+5, 25, x+7, 27), fill=(51, 50, 35))
            draw.point((x+6, 25), fill=(194, 172, 126))
        patch([(29, 25), (32, 22), (35, 33), (33, 38), (29, 36)], 1.14)
        line([(26, 34), (27, 37), (30, 38), (35, 37), (37, 34)], .64, 2)
        line([(20, 31), (15, 33), (12, 36)], 1.17, 2)
        line([(43, 31), (49, 33), (52, 36)], 1.14, 2)
        patch([(19, 47), (28, 42), (38, 42), (46, 47), (36, 46), (31, 46), (26, 46)], .42)
        line([(23, 47), (31, 48), (41, 47)], .32, 2)
        line([(26, 50), (34, 51), (39, 50)], 1.02)
        for _ in range(90):
            x, y = rng.randrange(9, 55), rng.randrange(52, 63)
            draw.point((x, y), fill=tint(base, rng.uniform(.39, .67)))
    elif tile in (1, 2, 4, 12):
        for x, y in [(10, 42), (25, 17), (45, 35), (56, 50), (32, 53)]:
            line([(x-5, y-2), (x+1, y+1), (x+8, y-4)], .69, 2)
            line([(x-5, y), (x+1, y+2), (x+7, y-2)], 1.17)
        if tile == 1:
            line([(33, 0), (32, 27), (34, 49), (32, 63)], .56, 3)
            line([(35, 0), (34, 27), (36, 49), (34, 63)], 1.25)
            for y in range(41, 60, 5):
                draw.rectangle((30, y, 31, y+1), fill=(122, 113, 100))
            line([(0, 58), (63, 58)], .65, 3)
    elif tile in (5, 10, 6):
        edge = 59 if tile != 10 else 54
        line([(0, edge-6), (63, edge-6)], .58, 4)
        line([(0, edge-3), (63, edge-3)], 1.25, 2)
        for x in range(1, 63, 5):
            line([(x, edge), (x+2, edge+2), (x+4, edge)], .63)
            if tile != 6:
                line([(x, edge-2), (x+2, edge-4), (x+4, edge-2)], 1.4)
        for x in (12, 25, 43, 55):
            line([(x-3, 18), (x, 27), (x-3, 45)], .8, 2)
            line([(x-1, 18), (x+2, 27), (x-1, 45)], 1.14)
    elif tile in (3, 7, 8, 11):
        line([(0, 6), (63, 6)], 1.28, 2)
        line([(0, 55), (63, 55)], .55, 3)
        for x in range(2, 61, 5):
            line([(x, 10), (x+2, 10)], 1.47)
        if tile == 11:
            for x in (11, 31, 52):
                line([(x, 4), (x+2, 58)], .56, 3)
                line([(x+2, 4), (x+4, 58)], 1.29)
            line([(0, 25), (18, 30), (37, 27), (63, 30)], .61, 3)
        if tile == 3:
            for y in (27, 34, 41):
                line([(20,y), (44,y+4)], .61, 2)
                line([(23,y+2), (42,y+5)], 1.29)
    elif tile == 9:
        patch([(19, 7), (45, 7), (50, 18), (45, 53), (20, 53), (15, 19)], 1.3)
        patch([(23, 17), (40, 17), (42, 26), (40, 44), (23, 44), (21, 27)], .55)
        line([(31, 20), (29, 44)], 1.46, 3)
    if tile in (1, 4, 5, 10, 12):
        for _ in range(65):
            x = rng.randrange(3, 62)
            y = rng.randrange(4, 60)
            if y > 35 or tile == 5:
                line([(x, y), (x+1, y-2)], rng.uniform(.62, 1.4))
    if tile == 0:
        # Bruised lower eyelids and an old cut across the cheek.
        draw.line([(15, 29), (22, 30), (28, 28)], fill=(116, 86, 77))
        draw.line([(39, 29), (45, 31), (50, 29)], fill=(111, 79, 72))
        draw.line([(48, 29), (46, 34), (44, 39)], fill=(109, 72, 68))
        draw.line([(49, 29), (47, 34), (45, 39)], fill=(174, 134, 117))
    if tile == 13:
        for y in (9, 25, 42, 58):
            line([(0, y+4), (23, y), (40, y+1), (63, y-4)], .58, 3)
            line([(0, y+1), (23, y-3), (40, y-2), (63, y-7)], 1.35, 2)
        patch([(43, 4), (58, 5), (58, 14), (50, 20), (40, 16)], .73)
    if tile == 14:
        for y in (9, 53):
            line([(2, y), (61, y)], .56, 2)
            for x in range(4, 63, 9):
                draw.ellipse((x-1,y-2,x+2,y+1), fill=(156, 130, 94))
        for _ in range(26):
            x, y = rng.randrange(4, 60), rng.randrange(10, 54)
            line([(x, y), (x+2, y-2)], rng.uniform(.59, 1.48))
    if tile == 15:
        for y in (13, 55, 59):
            line([(0,y+1), (29,y), (63,y+1)], 1.35)
        for x in range(3,62,7):
            line([(x-2,51), (x,48), (x+2,51), (x,53), (x-2,51)], 1.29)
    atlas.paste(island, ((tile % 4) * 64, (tile // 4) * 64))

atlas.save(ROOT / "public/assets/characters/wayfarer/wayfarer-atlas.png")

# Residents share a separate atlas so the Wayfarer's original textures stay intact.
residents = atlas.copy()
for tile in (1, 3, 5, 7, 11, 14, 15):
    left, top = (tile % 4) * 64, (tile // 4) * 64
    island = residents.crop((left, top, left + 64, top + 64))
    for y in range(64):
        for x in range(64):
            edge = abs(x - 31.5) / 31.5
            streak = sin(x * .16 + y * .032) * .05 + sin(x * .53 + y * .11) * .027
            wear = (.061 * cos(y * .22 + x * .17) if tile in (3, 11, 14) else 0)
            shadow = .94 + .11 * (1 - edge) - .18 * (y / 63) ** 2 + streak + wear
            island.putpixel((x, y), tint(island.getpixel((x, y)), shadow))
    draw = ImageDraw.Draw(island)
    if tile == 15:
        # Thread color and embroidery reserved for the Mourner's dark cloth.
        for y in (53, 57, 61):
            draw.line([(0,y),(21,y-1),(43,y),(63,y-1)], fill=(110, 83, 99))
        for x in range(3,63,8):
            draw.line([(x,49),(x+3,44),(x+6,49),(x+3,52),(x,49)], fill=(136, 100, 115))
    if tile == 14:
        # Oxidized steel, with a broad cold reflection and scratches across it.
        for i in range(34):
            x, y = rng.randrange(3, 62), rng.randrange(8, 57)
            color = island.getpixel((x,y))
            draw.line([(x,y),(x+1,y+2)], fill=tint(color,rng.uniform(1.15,1.55)))
    if tile in (5, 11):
        for y in range(12, 58, 4):
            for x in (7, 55):
                draw.line([(x,y),(x+1,y+1)], fill=(126, 106, 79))
    residents.paste(island, (left, top))


# Keep the first sixteen shared surfaces and give each costume its own UV islands.
costumes = Image.new("RGB", (512, 256))
for i in range(16):
    x, y = (i % 4) * 64, (i // 4) * 64
    costumes.paste(residents.crop((x,y,x+64,y+64)), ((i % 8) * 64, (i // 8) * 64))

materials = [
    (49, 65, 65), (93, 68, 53), (65, 66, 57), (151, 119, 98),
    (92, 99, 98), (52, 49, 47), (64, 42, 53), (71, 51, 65),
    (107, 97, 83), (109, 84, 52), (86, 96, 96), (61, 67, 68),
    (85, 60, 46), (49, 54, 79), (96, 83, 72), (49, 92, 71),
]
for index, base in enumerate(materials, 16):
    tile = Image.new("RGB", (64,64))
    for y in range(64):
        for x in range(64):
            v = x / 63
            h = y / 63
            light = 1.13 - .31*h + .10*cos(2*pi*(v-.38))
            light += .075*cos(x*.26 + sin(y*.053)*1.52)
            light += .034*sin(x*.67+y*.14) + rng.uniform(-.023,.023)
            tile.putpixel((x,y),tint(base,light))
    pen = ImageDraw.Draw(tile)

    def stroke(points, value, width=1):
        pen.line(points, fill=tint(base,value), width=width)

    def stitches(x, start=10, end=59):
        for y in range(start, end, 4):
            stroke([(x, y), (x+1, y+1)], 1.51)

    if index == 16:
        for x, y in [(12,20),(22,32),(36,38),(51,46),(21,49)]:
            stroke([(x-5,y-4),(x,y+1),(x+8,y+4)],.7,2)
            stroke([(x-5,y-5),(x,y),(x+8,y+3)],1.21)
        stroke([(0,58),(34,60),(63,58)],.66,2)
    if index in (17,18,22,23,24,28,29,30):
        # Painterly folds with a dark crease and a narrow highlight on the lit slope.
        for x, sway in ((11,4),(24,-4),(40,7),(51,-1)):
            stroke([(x+sway,18),(x,34),(x-sway,50),(x-1,63)], .73, 2)
            stroke([(x+sway-2,23),(x-2,37),(x-sway-2,49)], 1.17)
        for x in (4,58):
            stitches(x, 11, 57)
        stroke([(0,56),(21,58),(40,56),(63,58)], .64, 2)
        stroke([(0,59),(21,61),(40,59),(63,61)], 1.22)
    if index == 17:
        stroke([(5,13),(29,16),(58,13)],1.14,2)
        stroke([(7,15),(27,18),(57,15)],.58,2)
        for x, y in [(19,35),(37,43),(45,33),(27,49)]:
            stroke([(x-4,y+2),(x,y),(x+3,y+1)],1.34)
    if index == 19:
        # Sculpted planes of a tired face on the dedicated UV island.
        pen = ImageDraw.Draw(tile)
        pen.polygon([(2,8),(11,13),(13,30),(9,46),(16,62),(0,63)], fill=(93,70,59))
        pen.polygon([(57,7),(63,9),(63,63),(45,63),(54,50),(52,36)], fill=(108,79,64))
        pen.polygon([(9,30),(17,25),(24,29),(18,37),(10,39)], fill=(124,91,75))
        pen.polygon([(36,31),(46,26),(54,32),(49,40),(43,38)], fill=(128,94,78))
        pen.polygon([(28,21),(34,22),(38,37),(35,41),(29,41),(25,38)], fill=(171,132,105))
        pen.polygon([(27,27),(29,24),(30,35),(27,39),(24,36)], fill=(123,88,72))
        pen.line([(20,17),(28,16),(31,18)], fill=(107,82,69), width=2)
        pen.line([(32,11),(41,11),(48,15)], fill=(119,88,73))
        for x in (13,38):
            pen.line([(x,24),(x+6,20),(x+13,22)], fill=(67,55,49), width=3)
            pen.line([(x+1,27),(x+7,25),(x+12,26)], fill=(74,55,49), width=2)
            pen.line([(x+4,26),(x+9,26)], fill=(162,137,109))
            pen.point((x+6,26), fill=(62,50,43))
            pen.line([(x+1,29),(x+7,30),(x+11,29)], fill=(104,75,66))
        pen.polygon([(11,44),(19,40),(27,44),(37,43),(53,42),(52,56),(44,63),(17,63)], fill=(82,65,54))
        pen.line([(23,47),(31,48),(40,46)], fill=(61,45,39), width=2)
        pen.line([(28,49),(34,50),(39,48)], fill=(140,99,85))
        pen.line([(48,13),(45,22),(47,31),(42,39)], fill=(151,104,89))
        for _ in range(106):
            x,y = rng.randrange(11,53),rng.randrange(42,63)
            pen.point((x,y), fill=tint(tile.getpixel((x,y)), rng.uniform(.76,1.4)))
    if index in (20,26,27):
        # Broad scraped-metal highlights and deliberate dents instead of uniform speckle.
        for y in range(64):
            for x in range(64):
                diagonal = abs(x - (26 + y * .29))
                sheen = .88 + .38 * max(0, 1 - diagonal / 25)
                tile.putpixel((x,y), tint(tile.getpixel((x,y)), sheen))
        for x,y in [(10,37),(31,28),(49,39),(37,48),(24,50),(53,20),(16,21)]:
            stroke([(x-4,y+2),(x,y),(x+4,y-3)],.61,2)
            stroke([(x-3,y+2),(x,y+1),(x+4,y-2)],1.51)
        stroke([(2,56),(29,59),(62,54)],1.34,2)
        stroke([(2,59),(29,62),(62,57)],.56)
    if index == 21:
        stroke([(0,45),(31,44),(63,45)], .65, 2)
        stroke([(0,49),(31,48),(63,49)], 1.27)
        stroke([(4,25),(9,20),(12,17)], 1.25)
    if index in (22,23):
        for x in range(4,60,8):
            pen.line([(x,52),(x+3,47),(x+6,51),(x+3,55),(x,52)],fill=(124,90,103))
            pen.point((x+3,51),fill=(170,122,133))
    if index == 25:
        for x in range(3,62,8):
            pen.rectangle((x,25,x+5,43),fill=(47,34,30))
            pen.rectangle((x+1,33,x+4,41),fill=(144,71,37))
            pen.line((x+1,41,x+4,41),fill=(221,126,57))
        stroke([(1,21),(62,21)],1.42)
        stroke([(1,47),(62,47)],1.32)
    if index == 28:
        pen.polygon([(31,19),(36,27),(42,29),(36,36),(33,47),(29,36),(22,30),(29,27)], fill=(146,116,80))
        pen.line([(25,31),(39,31)],fill=(91,69,53))
    if index == 29:
        stroke([(32,1),(32,38),(29,63)],.53,2)
        stroke([(34,1),(34,38),(31,63)],1.34)
        for y in (13,23,34,44):
            pen.rectangle((29,y,30,y+1),fill=(149,127,91))
    if index == 31:
        pen.rectangle((17,24,47,46), fill=(146,130,98))
        pen.line((21,29,43,29), fill=(77,71,51), width=2)
        pen.line((23,35,42,35), fill=(94,83,54))
        pen.line((23,39,39,39), fill=(105,87,56))
        stroke([(9,12),(11,43),(15,54)],1.53,2)
    if index in (16,17,18,22,23,24,26,27,28,29,30):
        # Pool dirt under hems and around scuffed areas in irregular patches.
        stains = [(12,57,14,15), (48,53,15,12), (39,22,9,12)]
        if index in (17,18,26,28,29):
            stains += [(22,37,12,16), (55,18,10,14)]
        color = (69,42,36) if index in (17,18,26,27,28) else (55,48,41)
        for y in range(64):
            for x in range(64):
                amount = 0
                wobble = .79 + .15*sin(.24*x+.52*y) + .18*cos(.59*x-.14*y)
                for cx,cy,rx,ry in stains:
                    distance = ((x-cx)/rx)**2 + ((y-cy)/ry)**2
                    amount = max(amount, .44*max(0,1-distance*wobble))
                pixel = tile.getpixel((x,y))
                tile.putpixel((x,y), tuple(round(p*(1-amount)+c*amount) for p,c in zip(pixel,color)))
    costumes.paste(tile, ((index % 8)*64,(index // 8)*64))

costumes.save(ROOT / "public/assets/characters/wayfarer/residents-atlas.png")
