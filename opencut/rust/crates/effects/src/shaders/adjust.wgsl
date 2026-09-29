struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

// Uniform data is one flat f32 array. Index layout (see
// rust/crates/effects/src/uniforms.rs — must stay in sync):
//   0        resolution.x
//   1        resolution.y
//   2        exposure    (-1..1, interpreted as +/- 3 stops)
//   3        contrast    (-1..1)
//   4        saturation  (-1..1)
//   5        temperature (-1..1)
//   6        tint        (-1..1)
//   7        highlights  (-1..1)
//   8        shadows     (-1..1)
//   9..32    hsl: 8 bands x 3 (hueShiftDegrees, saturation[-1..1], lightness[-1..1])
//            band order: red, orange, yellow, green, cyan, blue, purple, magenta
//   33..36   curve point counts (luma, red, green, blue)
//   37..68   curves: 4 curves x 4 points x 2 (x, y); points sorted ascending x
const UNIFORM_LEN = 128;

struct AdjustUniforms {
    data: array<f32, UNIFORM_LEN>,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: AdjustUniforms;

const LUMA: vec3f = vec3f(0.2126, 0.7152, 0.0722);

fn uni(index: i32) -> f32 {
    return uniforms.data[index];
}

fn srgb_to_linear(c: vec3f) -> vec3f {
    let lo = c / 12.92;
    let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
    return select(hi, lo, c <= vec3f(0.04045));
}

fn linear_to_srgb(c: vec3f) -> vec3f {
    let lo = c * 12.92;
    let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
    return select(hi, lo, c <= vec3f(0.0031308));
}

fn band_center(band: i32) -> f32 {
    switch band {
        case 0: { return 0.0; }    // red
        case 1: { return 30.0; }   // orange
        case 2: { return 60.0; }   // yellow
        case 3: { return 120.0; }  // green
        case 4: { return 180.0; }  // cyan
        case 5: { return 240.0; }  // blue
        case 6: { return 280.0; }  // purple
        default: { return 300.0; } // magenta
    }
}

fn angular_distance(a: f32, b: f32) -> f32 {
    let d = abs(a - b);
    return select(d, 360.0 - d, d > 180.0);
}

fn rgb_to_hsl(c: vec3f) -> vec3f {
    let maxc = max(c.r, max(c.g, c.b));
    let minc = min(c.r, min(c.g, c.b));
    let l = (maxc + minc) * 0.5;
    let delta = maxc - minc;
    if delta == 0.0 {
        return vec3f(0.0, 0.0, l);
    }
    let s = delta / (1.0 - abs(2.0 * l - 1.0));
    var h = 0.0;
    if maxc == c.r {
        h = (c.g - c.b) / delta;
        if h < 0.0 {
            h = h + 6.0;
        }
    } else if maxc == c.g {
        h = (c.b - c.r) / delta + 2.0;
    } else {
        h = (c.r - c.g) / delta + 4.0;
    }
    return vec3f(h * 60.0, s, l);
}

fn hsl_to_rgb(hsl: vec3f) -> vec3f {
    let h = hsl.x;
    let s = hsl.y;
    let l = hsl.z;
    if s == 0.0 {
        return vec3f(l, l, l);
    }
    let c = (1.0 - abs(2.0 * l - 1.0)) * s;
    let hp = h / 60.0;
    let x = c * (1.0 - abs((hp - floor(hp / 2.0) * 2.0) - 1.0));
    let m = l - c * 0.5;
    var rgb = vec3f(0.0);
    if hp < 1.0 {
        rgb = vec3f(c, x, 0.0);
    } else if hp < 2.0 {
        rgb = vec3f(x, c, 0.0);
    } else if hp < 3.0 {
        rgb = vec3f(0.0, c, x);
    } else if hp < 4.0 {
        rgb = vec3f(0.0, x, c);
    } else if hp < 5.0 {
        rgb = vec3f(x, 0.0, c);
    } else {
        rgb = vec3f(c, 0.0, x);
    }
    return rgb + vec3f(m);
}

fn apply_white_balance(c: vec3f) -> vec3f {
    let temperature = uni(5);
    let tint = uni(6);
    let r_gain = 1.0 + temperature * 0.1 + tint * 0.05;
    let g_gain = 1.0 - tint * 0.1;
    let b_gain = 1.0 - temperature * 0.1 + tint * 0.05;
    return c * vec3f(r_gain, g_gain, b_gain);
}

fn apply_highlights_shadows(c: vec3f) -> vec3f {
    let luma = dot(c, LUMA);
    let highlights = uni(7);
    let shadows = uni(8);
    let h_mask = smoothstep(0.5, 1.0, luma);
    let s_mask = 1.0 - smoothstep(0.0, 0.5, luma);
    return c + vec3f(highlights * 0.3) * h_mask + vec3f(shadows * 0.3) * s_mask;
}

fn apply_hsl(c: vec3f) -> vec3f {
    let hsl = rgb_to_hsl(c);
    var hue_shift = 0.0;
    var sat_shift = 0.0;
    var light_shift = 0.0;
    for (var band = 0; band < 8; band = band + 1) {
        let distance = angular_distance(hsl.x, band_center(band));
        let weight = clamp(1.0 - distance / 30.0, 0.0, 1.0);
        hue_shift = hue_shift + uni(9 + band * 3 + 0) * weight;
        sat_shift = sat_shift + uni(9 + band * 3 + 1) * weight;
        light_shift = light_shift + uni(9 + band * 3 + 2) * weight;
    }
    let next = vec3f(
        hsl.x + hue_shift,
        clamp(hsl.y * (1.0 + sat_shift), 0.0, 1.0),
        clamp(hsl.z + light_shift, 0.0, 1.0),
    );
    return hsl_to_rgb(next);
}

fn evaluate_curve(curve_index: i32, t: f32) -> f32 {
    let base = 37 + curve_index * 8;
    let count = clamp(i32(uni(33 + curve_index)), 2, 4);
    var prev_x = uni(base);
    var prev_y = uni(base + 1);
    if t <= prev_x {
        return prev_y;
    }
    for (var i = 1; i < 4; i = i + 1) {
        if i >= count {
            break;
        }
        let x = uni(base + i * 2);
        let y = uni(base + i * 2 + 1);
        if t <= x {
            let span = x - prev_x;
            if span <= 0.0 {
                return y;
            }
            return mix(prev_y, y, (t - prev_x) / span);
        }
        prev_x = x;
        prev_y = y;
    }
    return uni(base + (count - 1) * 2 + 1);
}

fn apply_curves(c: vec3f) -> vec3f {
    var rgb = c;
    let luma = dot(rgb, LUMA);
    let luma_out = evaluate_curve(0, clamp(luma, 0.0, 1.0));
    rgb = rgb + vec3f(luma_out - luma);
    rgb.r = evaluate_curve(1, clamp(rgb.r, 0.0, 1.0));
    rgb.g = evaluate_curve(2, clamp(rgb.g, 0.0, 1.0));
    rgb.b = evaluate_curve(3, clamp(rgb.b, 0.0, 1.0));
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let color = textureSample(input_texture, input_sampler, input.tex_coord);
    var rgb = srgb_to_linear(color.rgb);

    // exposure
    rgb = rgb * exp2(uni(2) * 3.0);

    // temperature / tint
    rgb = apply_white_balance(rgb);

    // contrast around 0.5
    let contrast = uni(3);
    rgb = (rgb - vec3f(0.5)) * (1.0 + contrast) + vec3f(0.5);

    // saturation
    let saturation = uni(4);
    let luma = dot(rgb, LUMA);
    rgb = mix(vec3f(luma), rgb, 1.0 + saturation);

    // highlights / shadows
    rgb = apply_highlights_shadows(rgb);

    // per-hue HSL
    rgb = apply_hsl(rgb);

    // tone + per-channel curves
    rgb = apply_curves(rgb);

    rgb = linear_to_srgb(clamp(rgb, vec3f(0.0), vec3f(1.0)));
    return vec4f(rgb, color.a);
}
