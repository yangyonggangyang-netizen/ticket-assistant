#!/usr/bin/env python3
"""Generate a cinema ticket themed icon for the Electron app."""
from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size=256):
    """Create a cinema ticket themed icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background: rounded rectangle with gradient-like dark red
    margin = size // 16
    bg_color = (185, 28, 28, 255)  # Cinema red
    bg_dark = (140, 20, 20, 255)

    # Draw rounded rectangle background
    radius = size // 6
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=bg_color
    )

    # Draw a film strip decoration at top
    strip_h = size // 10
    strip_y = margin + size // 8
    draw.rounded_rectangle(
        [margin + size // 12, strip_y, size - margin - size // 12, strip_y + strip_h],
        radius=strip_h // 3,
        fill=(255, 255, 255, 240)
    )
    # Film perforations
    hole_w = size // 20
    hole_h = strip_h // 2
    hole_y = strip_y + (strip_h - hole_h) // 2
    start_x = margin + size // 8
    gap = size // 10
    for i in range(5):
        x = start_x + i * gap
        if x + hole_w > size - margin - size // 8:
            break
        draw.rounded_rectangle(
            [x, hole_y, x + hole_w, hole_y + hole_h],
            radius=hole_h // 3,
            fill=bg_color
        )

    # Draw ticket shape in center-bottom
    ticket_w = size * 3 // 5
    ticket_h = size * 2 // 5
    ticket_x = (size - ticket_w) // 2
    ticket_y = strip_y + strip_h + size // 16

    # Ticket body (white with slight transparency)
    draw.rounded_rectangle(
        [ticket_x, ticket_y, ticket_x + ticket_w, ticket_y + ticket_h],
        radius=size // 30,
        fill=(255, 255, 255, 250)
    )

    # Ticket perforation line (dashed)
    line_y = ticket_y + ticket_h // 2
    dash_w = size // 40
    dash_gap = size // 60
    x = ticket_x + size // 30
    while x < ticket_x + ticket_w - size // 30:
        draw.rectangle(
            [x, line_y - 1, x + dash_w, line_y + 1],
            fill=(200, 200, 200, 200)
        )
        x += dash_w + dash_gap

    # Draw "票" character or a play triangle
    # Use a play triangle to represent cinema
    tri_size = ticket_h // 3
    tri_cx = ticket_x + ticket_w // 4
    tri_cy = ticket_y + ticket_h // 2
    draw.polygon(
        [
            (tri_cx - tri_size // 3, tri_cy - tri_size // 2),
            (tri_cx - tri_size // 3, tri_cy + tri_size // 2),
            (tri_cx + tri_size // 2, tri_cy),
        ],
        fill=bg_color
    )

    # Draw "出票" text on the right part of ticket
    try:
        font_size = size // 9
        # Try common Chinese fonts on Windows
        font_paths = [
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/simhei.ttf",
            "C:/Windows/Fonts/STZHONGS.TTF",
        ]
        font = None
        for fp in font_paths:
            if os.path.exists(fp):
                font = ImageFont.truetype(fp, font_size)
                break
        if font:
            text = "出票"
            text_x = ticket_x + ticket_w // 2
            text_y = ticket_y + ticket_h // 2 - font_size // 2
            draw.text((text_x, text_y), text, fill=bg_color, font=font)
    except Exception as e:
        print(f"Font error: {e}")

    # Draw a small star/sparkle at top-right corner
    star_cx = size - margin - size // 10
    star_cy = margin + size // 10
    star_r = size // 20
    draw.ellipse(
        [star_cx - star_r, star_cy - star_r, star_cx + star_r, star_cy + star_r],
        fill=(255, 215, 0, 230)  # Gold
    )

    return img

def main():
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'build')
    os.makedirs(output_dir, exist_ok=True)

    # Generate at 256x256 and save as ICO with multiple sizes
    icon = create_icon(256)

    ico_path = os.path.join(output_dir, 'icon.ico')
    # Save ICO with 256x256 first (required by electron-builder) plus common smaller sizes
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    icon_images = []
    for s in sizes:
        resized = icon.resize(s, Image.LANCZOS)
        # Convert to RGBA to ensure proper ICO handling
        if resized.mode != 'RGBA':
            resized = resized.convert('RGBA')
        icon_images.append(resized)

    icon_images[0].save(
        ico_path,
        format='ICO',
        sizes=sizes,
        append_images=icon_images[1:]
    )
    print(f"Icon saved to: {ico_path}")

    # Also save PNG for reference
    png_path = os.path.join(output_dir, 'icon.png')
    icon.save(png_path, format='PNG')
    print(f"PNG saved to: {png_path}")

if __name__ == '__main__':
    main()
