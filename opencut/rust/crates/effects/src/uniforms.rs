use bytemuck::{Pod, Zeroable};

use crate::{EffectPass, EffectsError, UniformValue};

/// Number of `f32` slots in the color-adjust uniform buffer. See the layout
/// comment in `shaders/adjust.wgsl` and `pack_adjust_uniforms` below; the two
/// must stay in sync.
pub const ADJUST_UNIFORM_COUNT: usize = 128;

/// Number of `f32` slots in the generic param-effect uniform buffer. Layout:
///   [0]        resolution.x
///   [1]        resolution.y
///   [2..64]    effect params (shader-specific order, zero-padded)
///
/// The param order is owned by the TS `buildPasses` for each effect (which
/// emits a single `u_params` vector) and mirrored by the WGSL `data` array in
/// each `shaders/*.wgsl` file. See `pack_params_uniforms` below.
pub const PARAM_UNIFORM_COUNT: usize = 64;

/// Gaussian-blur uniform layout, kept byte-identical to the original
/// single-shader layout so blur output is unchanged.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct BlurUniformBuffer {
    resolution: [f32; 2],
    direction: [f32; 2],
    scalars: [f32; 4],
}

/// Color-adjust uniform layout: one flat `f32` array, indexed by named offsets
/// shared with the WGSL shader. A single array avoids WGSL/Rust struct
/// alignment drift while still being a single contiguous uniform buffer.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct AdjustUniformBuffer {
    data: [f32; ADJUST_UNIFORM_COUNT],
}

/// LUT uniform layout: four scalars, kept 16-byte aligned for WebGL.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct LutUniformBuffer {
    strength: f32,
    lut_size: f32,
    domain_min: f32,
    domain_max: f32,
}

/// Number of `f32` slots in the chroma-key uniform buffer. See the layout
/// comment in `shaders/chroma_key.wgsl` and `pack_chroma_key_uniforms` below.
pub const CHROMA_KEY_UNIFORM_COUNT: usize = 8;

/// Chroma-key uniform layout: one flat `f32` array (key color RGB + one pad
/// slot + four scalars), matching the layout comment in the WGSL shader.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ChromaKeyUniformBuffer {
    data: [f32; CHROMA_KEY_UNIFORM_COUNT],
}

/// Generic param-effect uniform layout: resolution followed by a flat param
/// array. Every effect shader registered against `pack_params_uniforms` reads
/// the same shape, so the packer never needs per-shader special-casing.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ParamsUniformBuffer {
    data: [f32; PARAM_UNIFORM_COUNT],
}

/// A shader-specific uniform packer: reads a pass's named uniforms and returns
/// the exact bytes the matching shader expects in its uniform buffer.
pub type UniformPacker = fn(&EffectPass, u32, u32) -> Result<Vec<u8>, EffectsError>;

pub fn pack_blur_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, EffectsError> {
    let shader = pass.shader.as_str();
    let sigma = read_number_uniform(pass, "u_sigma")?;
    let step = read_number_uniform(pass, "u_step")?;
    let direction = read_vec_uniform(pass, "u_direction", 2)?;

    for uniform in pass.uniforms.keys() {
        if uniform == "u_sigma" || uniform == "u_step" || uniform == "u_direction" {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    Ok(bytemuck::bytes_of(&BlurUniformBuffer {
        resolution: [width as f32, height as f32],
        direction: [direction[0], direction[1]],
        scalars: [sigma, step, 0.0, 0.0],
    })
    .to_vec())
}

pub fn pack_adjust_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, EffectsError> {
    let shader = pass.shader.as_str();
    let basic = read_vec_uniform(pass, "u_basic", 7)?;
    let hsl = read_vec_uniform(pass, "u_hsl", 24)?;
    let curve_counts = read_vec_uniform(pass, "u_curve_counts", 4)?;
    let curves = read_vec_uniform(pass, "u_curves", 32)?;

    const KNOWN: [&str; 4] = ["u_basic", "u_hsl", "u_curve_counts", "u_curves"];
    for uniform in pass.uniforms.keys() {
        if KNOWN.contains(&uniform.as_str()) {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    let mut data = [0.0f32; ADJUST_UNIFORM_COUNT];
    data[0] = width as f32;
    data[1] = height as f32;
    data[2..9].copy_from_slice(&basic);
    data[9..33].copy_from_slice(&hsl);
    data[33..37].copy_from_slice(&curve_counts);
    data[37..69].copy_from_slice(&curves);

    Ok(bytemuck::bytes_of(&AdjustUniformBuffer { data }).to_vec())
}

pub fn pack_lut_uniforms(
    pass: &EffectPass,
    _width: u32,
    _height: u32,
) -> Result<Vec<u8>, EffectsError> {
    let shader = pass.shader.as_str();
    let strength = read_number_uniform(pass, "u_strength")?;

    for uniform in pass.uniforms.keys() {
        if uniform == "u_strength" {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    let lut = pass.lut.as_ref().ok_or_else(|| EffectsError::MissingLut {
        shader: shader.to_string(),
    })?;

    Ok(bytemuck::bytes_of(&LutUniformBuffer {
        strength,
        lut_size: lut.size as f32,
        domain_min: lut.domain_min,
        domain_max: lut.domain_max,
    })
    .to_vec())
}

pub fn pack_chroma_key_uniforms(
    pass: &EffectPass,
    _width: u32,
    _height: u32,
) -> Result<Vec<u8>, EffectsError> {
    let shader = pass.shader.as_str();
    let key_color = read_vec_uniform(pass, "u_key_color", 3)?;
    let tolerance = read_number_uniform(pass, "u_tolerance")?;
    let softness = read_number_uniform(pass, "u_softness")?;
    let spill = read_number_uniform(pass, "u_spill")?;
    let feather = read_number_uniform(pass, "u_feather")?;

    const KNOWN: [&str; 5] = [
        "u_key_color",
        "u_tolerance",
        "u_softness",
        "u_spill",
        "u_feather",
    ];
    for uniform in pass.uniforms.keys() {
        if KNOWN.contains(&uniform.as_str()) {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    let mut data = [0.0f32; CHROMA_KEY_UNIFORM_COUNT];
    data[0..3].copy_from_slice(&key_color);
    data[4] = tolerance;
    data[5] = softness;
    data[6] = spill;
    data[7] = feather;

    Ok(bytemuck::bytes_of(&ChromaKeyUniformBuffer { data }).to_vec())
}

/// Generic packer for every effect shader that uses the flat `u_params` layout.
/// The pass must carry exactly one uniform, `u_params`, a `Vec<f32>` whose
/// entries map 1:1 onto `data[2..]` in the shader.
pub fn pack_params_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, EffectsError> {
    let shader = pass.shader.as_str();

    for uniform in pass.uniforms.keys() {
        if uniform == "u_params" {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    let Some(value) = pass.uniforms.get("u_params") else {
        return Err(EffectsError::MissingUniform {
            shader: shader.to_string(),
            uniform: "u_params".to_string(),
        });
    };
    let UniformValue::Vector(params) = value else {
        return Err(EffectsError::InvalidVectorUniform {
            shader: shader.to_string(),
            uniform: "u_params".to_string(),
            expected_length: 0,
        });
    };
    if params.len() > PARAM_UNIFORM_COUNT - 2 {
        return Err(EffectsError::TooManyUniformValues {
            shader: shader.to_string(),
            uniform: "u_params".to_string(),
            max: PARAM_UNIFORM_COUNT - 2,
        });
    }

    let mut data = [0.0f32; PARAM_UNIFORM_COUNT];
    data[0] = width as f32;
    data[1] = height as f32;
    data[2..2 + params.len()].copy_from_slice(params);

    Ok(bytemuck::bytes_of(&ParamsUniformBuffer { data }).to_vec())
}


fn read_number_uniform(pass: &EffectPass, uniform: &str) -> Result<f32, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Number(value) => Ok(*value),
        UniformValue::Vector(_) => Err(EffectsError::InvalidNumberUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        }),
    }
}

fn read_vec_uniform(
    pass: &EffectPass,
    uniform: &str,
    expected_length: usize,
) -> Result<Vec<f32>, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    let UniformValue::Vector(values) = value else {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length,
        });
    };
    if values.len() != expected_length {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length,
        });
    }
    Ok(values.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::UniformValue;
    use std::collections::HashMap;

    fn pass(uniforms: HashMap<&str, UniformValue>) -> EffectPass {
        EffectPass {
            shader: "gaussian-blur".to_string(),
            uniforms: uniforms
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
            lut: None,
        }
    }

    fn blur_pass() -> EffectPass {
        pass(HashMap::from([
            ("u_sigma", UniformValue::Number(4.0)),
            ("u_step", UniformValue::Number(2.0)),
            ("u_direction", UniformValue::Vector(vec![1.0, 0.0])),
        ]))
    }

    #[test]
    fn blur_packing_is_byte_stable() {
        let bytes = pack_blur_uniforms(&blur_pass(), 1920, 1080).expect("pack blur");
        assert_eq!(bytes.len(), std::mem::size_of::<BlurUniformBuffer>());
        assert_eq!(bytes.len(), 32);

        // [width, height, dir.x, dir.y, sigma, step, 0, 0] as little-endian f32.
        let floats: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();
        assert_eq!(floats, vec![1920.0, 1080.0, 1.0, 0.0, 4.0, 2.0, 0.0, 0.0]);
    }

    #[test]
    fn blur_packing_rejects_unknown_uniform() {
        let mut p = blur_pass();
        p.uniforms
            .insert("u_unknown".to_string(), UniformValue::Number(1.0));
        assert!(matches!(
            pack_blur_uniforms(&p, 10, 10),
            Err(EffectsError::UnsupportedUniform { .. })
        ));
    }

    #[test]
    fn blur_packing_rejects_missing_uniform() {
        let mut p = blur_pass();
        p.uniforms.remove("u_sigma");
        assert!(matches!(
            pack_blur_uniforms(&p, 10, 10),
            Err(EffectsError::MissingUniform { .. })
        ));
    }

    fn adjust_pass() -> EffectPass {
        EffectPass {
            shader: "adjust".to_string(),
            uniforms: HashMap::from([
                ("u_basic", UniformValue::Vector(vec![0.5, -0.25, 0.2, 0.0, 0.0, 0.0, 0.0])),
                ("u_hsl", UniformValue::Vector(vec![0.0; 24])),
                ("u_curve_counts", UniformValue::Vector(vec![4.0, 4.0, 4.0, 4.0])),
                ("u_curves", UniformValue::Vector(vec![0.0; 32])),
            ])
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect(),
            lut: None,
        }
    }

    #[test]
    fn adjust_packing_lays_out_named_uniforms() {
        let bytes = pack_adjust_uniforms(&adjust_pass(), 1280, 720).expect("pack adjust");
        assert_eq!(bytes.len(), ADJUST_UNIFORM_COUNT * 4);

        let floats: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();

        assert_eq!(floats[0], 1280.0);
        assert_eq!(floats[1], 720.0);
        assert_eq!(floats[2], 0.5); // exposure
        assert_eq!(floats[3], -0.25); // contrast
        assert_eq!(floats[4], 0.2); // saturation
        assert_eq!(floats[5], 0.0); // temperature
        assert_eq!(floats[6], 0.0); // tint
        assert_eq!(floats[7], 0.0); // highlights
        assert_eq!(floats[8], 0.0); // shadows
        assert_eq!(floats[33], 4.0); // luma curve count
        assert!(floats[37..69].iter().all(|&v| v == 0.0));
    }

    #[test]
    fn adjust_packing_rejects_wrong_vector_length() {
        let mut p = adjust_pass();
        p.uniforms
            .insert("u_basic".to_string(), UniformValue::Vector(vec![0.0; 6]));
        assert!(matches!(
            pack_adjust_uniforms(&p, 10, 10),
            Err(EffectsError::InvalidVectorUniform { .. })
        ));
    }

    #[test]
    fn adjust_packing_rejects_unknown_uniform() {
        let mut p = adjust_pass();
        p.uniforms
            .insert("u_extra".to_string(), UniformValue::Number(1.0));
        assert!(matches!(
            pack_adjust_uniforms(&p, 10, 10),
            Err(EffectsError::UnsupportedUniform { .. })
        ));
    }

    fn chroma_key_pass() -> EffectPass {
        EffectPass {
            shader: "chroma-key".to_string(),
            uniforms: HashMap::from([
                (
                    "u_key_color",
                    UniformValue::Vector(vec![0.0, 1.0, 0.0]),
                ),
                ("u_tolerance", UniformValue::Number(0.4)),
                ("u_softness", UniformValue::Number(0.2)),
                ("u_spill", UniformValue::Number(0.4)),
                ("u_feather", UniformValue::Number(0.0)),
            ])
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect(),
            lut: None,
        }
    }

    #[test]
    fn chroma_key_packing_lays_out_named_uniforms() {
        let bytes =
            pack_chroma_key_uniforms(&chroma_key_pass(), 1920, 1080).expect("pack chroma key");
        assert_eq!(bytes.len(), CHROMA_KEY_UNIFORM_COUNT * 4);

        let floats: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();

        assert_eq!(floats[0], 0.0); // key color r
        assert_eq!(floats[1], 1.0); // key color g
        assert_eq!(floats[2], 0.0); // key color b
        assert_eq!(floats[3], 0.0); // padding
        assert_eq!(floats[4], 0.4); // tolerance
        assert_eq!(floats[5], 0.2); // softness
        assert_eq!(floats[6], 0.4); // spill
        assert_eq!(floats[7], 0.0); // feather
    }

    #[test]
    fn chroma_key_packing_rejects_wrong_key_color_length() {
        let mut p = chroma_key_pass();
        p.uniforms.insert(
            "u_key_color".to_string(),
            UniformValue::Vector(vec![0.0, 1.0]),
        );
        assert!(matches!(
            pack_chroma_key_uniforms(&p, 10, 10),
            Err(EffectsError::InvalidVectorUniform { .. })
        ));
    }

    #[test]
    fn chroma_key_packing_rejects_missing_uniform() {
        let mut p = chroma_key_pass();
        p.uniforms.remove("u_spill");
        assert!(matches!(
            pack_chroma_key_uniforms(&p, 10, 10),
            Err(EffectsError::MissingUniform { .. })
        ));
    }

    #[test]
    fn chroma_key_packing_rejects_unknown_uniform() {
        let mut p = chroma_key_pass();
        p.uniforms
            .insert("u_extra".to_string(), UniformValue::Number(1.0));
        assert!(matches!(
            pack_chroma_key_uniforms(&p, 10, 10),
            Err(EffectsError::UnsupportedUniform { .. })
        ));
    }

    #[test]
    fn effect_shaders_parse_as_valid_wgsl() {
        for source in [
            include_str!("shaders/gaussian_blur.wgsl"),
            include_str!("shaders/adjust.wgsl"),
            include_str!("shaders/lut.wgsl"),
            include_str!("shaders/chroma_key.wgsl"),
            include_str!("shaders/glitch.wgsl"),
            include_str!("shaders/vhs.wgsl"),
            include_str!("shaders/pixelate.wgsl"),
            include_str!("shaders/chromatic_aberration.wgsl"),
            include_str!("shaders/rgb_split.wgsl"),
            include_str!("shaders/fisheye.wgsl"),
            include_str!("shaders/mirror.wgsl"),
            include_str!("shaders/kaleidoscope.wgsl"),
            include_str!("shaders/zoom_blur.wgsl"),
            include_str!("shaders/radial_blur.wgsl"),
            include_str!("shaders/sharpen.wgsl"),
            include_str!("shaders/tilt_shift.wgsl"),
            include_str!("shaders/vignette.wgsl"),
            include_str!("shaders/film_grain.wgsl"),
            include_str!("shaders/noise.wgsl"),
            include_str!("shaders/halftone.wgsl"),
            include_str!("shaders/scanlines.wgsl"),
            include_str!("shaders/old_film.wgsl"),
            include_str!("shaders/duotone.wgsl"),
            include_str!("shaders/posterize.wgsl"),
            include_str!("shaders/invert.wgsl"),
            include_str!("shaders/glow.wgsl"),
            include_str!("shaders/neon_edge.wgsl"),
            include_str!("shaders/shake.wgsl"),
            include_str!("shaders/flicker.wgsl"),
        ] {
            if let Err(error) = naga::front::wgsl::parse_str(source) {
                panic!("WGSL parse error:\n{}", error.emit_to_string(source));
            }
        }
    }

    fn lut_pass() -> EffectPass {
        let mut data = vec![0.0f32; 2 * 2 * 2 * 3];
        for (i, value) in data.iter_mut().enumerate() {
            *value = i as f32 / 24.0;
        }
        EffectPass {
            shader: "lut".to_string(),
            uniforms: HashMap::from([("u_strength", UniformValue::Number(0.5))])
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
            lut: Some(crate::LutData {
                size: 2,
                data,
                domain_min: 0.1,
                domain_max: 0.9,
            }),
        }
    }

    fn params_pass(shader: &str, params: Vec<f32>) -> EffectPass {
        EffectPass {
            shader: shader.to_string(),
            uniforms: HashMap::from([("u_params", UniformValue::Vector(params))])
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
            lut: None,
        }
    }

    #[test]
    fn lut_packing_lays_out_strength_size_and_domain() {
        let bytes = pack_lut_uniforms(&lut_pass(), 1920, 1080).expect("pack lut");
        assert_eq!(bytes.len(), std::mem::size_of::<LutUniformBuffer>());
        assert_eq!(bytes.len(), 16);

        let floats: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();
        assert_eq!(floats, vec![0.5, 2.0, 0.1, 0.9]);
    }

    #[test]
    fn lut_packing_rejects_missing_lut() {
        let mut pass = lut_pass();
        pass.lut = None;
        assert!(matches!(
            pack_lut_uniforms(&pass, 10, 10),
            Err(EffectsError::MissingLut { .. })
        ));
    }

    #[test]
    fn lut_packing_rejects_unknown_uniform() {
        let mut pass = lut_pass();
        pass.uniforms
            .insert("u_extra".to_string(), UniformValue::Number(1.0));
        assert!(matches!(
            pack_lut_uniforms(&pass, 10, 10),
            Err(EffectsError::UnsupportedUniform { .. })
        ));
    }

    #[test]
    fn params_packing_lays_out_resolution_then_params() {
        let cases: [(&str, Vec<f32>); 25] = [
            ("glitch", vec![0.3, 8.0, 1.25]),
            ("vhs", vec![0.4, 1.25]),
            ("pixelate", vec![16.0]),
            ("chromatic-aberration", vec![0.3]),
            ("rgb-split", vec![0.3, 45.0]),
            ("fisheye", vec![0.4]),
            ("mirror", vec![2.0]),
            ("kaleidoscope", vec![6.0, 30.0]),
            ("zoom-blur", vec![0.4]),
            ("radial-blur", vec![0.4]),
            ("sharpen", vec![0.5]),
            ("tilt-shift", vec![0.4, 0.5, 0.3]),
            ("vignette", vec![0.6, 0.5]),
            ("film-grain", vec![0.2, 1.25]),
            ("noise", vec![0.25, 1.0, 1.25]),
            ("halftone", vec![8.0, 45.0]),
            ("scanlines", vec![4.0, 0.5]),
            ("old-film", vec![0.4, 1.25]),
            ("duotone", vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0]),
            ("posterize", vec![4.0]),
            ("invert", vec![1.0]),
            ("glow", vec![0.5, 0.5]),
            ("neon-edge", vec![0.6]),
            ("shake", vec![0.3, 1.25]),
            ("flicker", vec![0.4, 6.0, 1.25]),
        ];

        for (shader, params) in cases {
            let bytes = pack_params_uniforms(&params_pass(shader, params.clone()), 1280, 720)
                .unwrap_or_else(|e| panic!("pack {shader}: {e}"));
            assert_eq!(bytes.len(), PARAM_UNIFORM_COUNT * 4, "{shader}");

            let floats: Vec<f32> = bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            assert_eq!(floats[0], 1280.0, "{shader} resolution.x");
            assert_eq!(floats[1], 720.0, "{shader} resolution.y");
            for (i, value) in params.iter().enumerate() {
                assert_eq!(floats[2 + i], *value, "{shader} param {i}");
            }
            assert!(floats[2 + params.len()..].iter().all(|&v| v == 0.0));
        }
    }

    #[test]
    fn params_packing_rejects_unknown_uniform() {
        let mut p = params_pass("glitch", vec![0.3, 8.0, 1.25]);
        p.uniforms
            .insert("u_extra".to_string(), UniformValue::Number(1.0));
        assert!(matches!(
            pack_params_uniforms(&p, 10, 10),
            Err(EffectsError::UnsupportedUniform { .. })
        ));
    }

    #[test]
    fn params_packing_rejects_missing_params() {
        let p = EffectPass {
            shader: "glitch".to_string(),
            uniforms: HashMap::new(),
            lut: None,
        };
        assert!(matches!(
            pack_params_uniforms(&p, 10, 10),
            Err(EffectsError::MissingUniform { .. })
        ));
    }

    #[test]
    fn params_packing_rejects_scalar_params() {
        let p = EffectPass {
            shader: "glitch".to_string(),
            uniforms: HashMap::from([("u_params", UniformValue::Number(1.0))])
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
            lut: None,
        };
        assert!(matches!(
            pack_params_uniforms(&p, 10, 10),
            Err(EffectsError::InvalidVectorUniform { .. })
        ));
    }

    #[test]
    fn params_packing_rejects_too_many_values() {
        let p = params_pass("glitch", vec![0.0; PARAM_UNIFORM_COUNT]);
        assert!(matches!(
            pack_params_uniforms(&p, 10, 10),
            Err(EffectsError::TooManyUniformValues { .. })
        ));
    }
}
