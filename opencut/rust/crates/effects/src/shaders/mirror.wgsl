struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    data: array<f32, 64>,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

fn u(index: i32) -> f32 {
    return uniforms.data[index];
}

// data[2] = mode (0 horizontal, 1 vertical, 2 quad)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let mode = u(2);
    var uv = input.tex_coord;

    if (mode < 0.5) {
        // horizontal
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
    } else if (mode < 1.5) {
        // vertical
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else {
        // quad
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    }

    return textureSample(input_texture, input_sampler, uv);
}
