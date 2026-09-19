"""生成 CommandManager 图标条（PNG）。每组一条，6 个尺寸；同时生成组主图标。
用法: python3 make_icons.py  （需要 Pillow 与中文字体）"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'PidmPath.AddIn', 'Icons')
SIZES = [20, 32, 40, 64, 96, 128]
FONTS = ['/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
         '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
         'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf']

# (组文件名, 组色, [(按钮短标, 图标文字)])
GROUPS = {
    'start':   ((30, 90, 160),  ['新建', '侧型', '线体', '导入']),
    'carry':   ((20, 120, 90),  ['识别', '承载', '回程', '受料', '卸料', '过渡', '前倾', '凸弧', '凹弧', '托辊']),
    'drums':   ((190, 90, 20),  ['传动', '改向', '拉紧', '尾筒', '头筒', '主驱', '属性', '清扫', '犁卸', '压轮']),
    'loop':    ((120, 60, 160), ['Auto', '闭合', '间距']),
    'deliver': ((150, 40, 60),  ['分类', '确认', '奔离', '手1', '手2', '特性', '门禁', '导出', '面板']),
}

def font(px):
    for f in FONTS:
        if os.path.exists(f):
            try: return ImageFont.truetype(f, px)
            except Exception: pass
    return ImageFont.load_default()

def draw_icon(size, color, text):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = max(2, size // 6)
    d.rounded_rectangle([1, 1, size - 2, size - 2], radius=r, fill=color + (255,), outline=(255, 255, 255, 200), width=max(1, size // 32))
    px = int(size * (0.42 if len(text) <= 2 else 0.30))
    f = font(px)
    bbox = d.textbbox((0, 0), text, font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, font=f, fill=(255, 255, 255, 255))
    return im

def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (color, labels) in GROUPS.items():
        for s in SIZES:
            strip = Image.new('RGBA', (s * len(labels), s), (0, 0, 0, 0))
            for i, t in enumerate(labels):
                strip.paste(draw_icon(s, color, t), (i * s, 0))
            strip.save(os.path.join(OUT, f'{name}_{s}.png'))
            draw_icon(s, color, labels[0][:1]).save(os.path.join(OUT, f'{name}_main_{s}.png'))
    for s in SIZES:
        draw_icon(s, (30, 90, 160), 'DT').save(os.path.join(OUT, f'taskpane_{s}.png'))
    print('icons ->', OUT)

if __name__ == '__main__':
    main()
