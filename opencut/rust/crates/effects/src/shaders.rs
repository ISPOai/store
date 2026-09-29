use crate::uniforms::{
    pack_adjust_uniforms, pack_blur_uniforms, pack_chroma_key_uniforms, pack_lut_uniforms,
    pack_params_uniforms, UniformPacker,
};

/// A registered effect shader: its WGSL source plus the packer that turns a
/// pass's named uniforms into the bytes the shader's uniform buffer expects.
/// Adding a new effect shader is a matter of appending one entry to
/// `shader_specs` — the pipeline never special-cases shaders.
#[derive(Clone, Copy)]
pub struct ShaderSpec {
    pub id: &'static str,
    pub source: &'static str,
    pub pack: UniformPacker,
    /// Declares an auxiliary 3D LUT texture binding (group 2). The pipeline
    /// uploads the pass's `lut` data (cached by content hash) and binds it.
    pub lut: bool,
}

const GAUSSIAN_BLUR_SHADER_ID: &str = "gaussian-blur";
const GAUSSIAN_BLUR_SHADER_SOURCE: &str = include_str!("shaders/gaussian_blur.wgsl");

const ADJUST_SHADER_ID: &str = "adjust";
const ADJUST_SHADER_SOURCE: &str = include_str!("shaders/adjust.wgsl");

const LUT_SHADER_ID: &str = "lut";
const LUT_SHADER_SOURCE: &str = include_str!("shaders/lut.wgsl");

const CHROMA_KEY_SHADER_ID: &str = "chroma-key";
const CHROMA_KEY_SHADER_SOURCE: &str = include_str!("shaders/chroma_key.wgsl");

const GLITCH_SHADER_ID: &str = "glitch";
const GLITCH_SHADER_SOURCE: &str = include_str!("shaders/glitch.wgsl");

const VHS_SHADER_ID: &str = "vhs";
const VHS_SHADER_SOURCE: &str = include_str!("shaders/vhs.wgsl");

const PIXELATE_SHADER_ID: &str = "pixelate";
const PIXELATE_SHADER_SOURCE: &str = include_str!("shaders/pixelate.wgsl");

const CHROMATIC_ABERRATION_SHADER_ID: &str = "chromatic-aberration";
const CHROMATIC_ABERRATION_SHADER_SOURCE: &str =
    include_str!("shaders/chromatic_aberration.wgsl");

const RGB_SPLIT_SHADER_ID: &str = "rgb-split";
const RGB_SPLIT_SHADER_SOURCE: &str = include_str!("shaders/rgb_split.wgsl");

const FISHEYE_SHADER_ID: &str = "fisheye";
const FISHEYE_SHADER_SOURCE: &str = include_str!("shaders/fisheye.wgsl");

const MIRROR_SHADER_ID: &str = "mirror";
const MIRROR_SHADER_SOURCE: &str = include_str!("shaders/mirror.wgsl");

const KALEIDOSCOPE_SHADER_ID: &str = "kaleidoscope";
const KALEIDOSCOPE_SHADER_SOURCE: &str = include_str!("shaders/kaleidoscope.wgsl");

const ZOOM_BLUR_SHADER_ID: &str = "zoom-blur";
const ZOOM_BLUR_SHADER_SOURCE: &str = include_str!("shaders/zoom_blur.wgsl");

const RADIAL_BLUR_SHADER_ID: &str = "radial-blur";
const RADIAL_BLUR_SHADER_SOURCE: &str = include_str!("shaders/radial_blur.wgsl");

const SHARPEN_SHADER_ID: &str = "sharpen";
const SHARPEN_SHADER_SOURCE: &str = include_str!("shaders/sharpen.wgsl");

const TILT_SHIFT_SHADER_ID: &str = "tilt-shift";
const TILT_SHIFT_SHADER_SOURCE: &str = include_str!("shaders/tilt_shift.wgsl");

const VIGNETTE_SHADER_ID: &str = "vignette";
const VIGNETTE_SHADER_SOURCE: &str = include_str!("shaders/vignette.wgsl");

const FILM_GRAIN_SHADER_ID: &str = "film-grain";
const FILM_GRAIN_SHADER_SOURCE: &str = include_str!("shaders/film_grain.wgsl");

const NOISE_SHADER_ID: &str = "noise";
const NOISE_SHADER_SOURCE: &str = include_str!("shaders/noise.wgsl");

const HALFTONE_SHADER_ID: &str = "halftone";
const HALFTONE_SHADER_SOURCE: &str = include_str!("shaders/halftone.wgsl");

const SCANLINES_SHADER_ID: &str = "scanlines";
const SCANLINES_SHADER_SOURCE: &str = include_str!("shaders/scanlines.wgsl");

const OLD_FILM_SHADER_ID: &str = "old-film";
const OLD_FILM_SHADER_SOURCE: &str = include_str!("shaders/old_film.wgsl");

const DUOTONE_SHADER_ID: &str = "duotone";
const DUOTONE_SHADER_SOURCE: &str = include_str!("shaders/duotone.wgsl");

const POSTERIZE_SHADER_ID: &str = "posterize";
const POSTERIZE_SHADER_SOURCE: &str = include_str!("shaders/posterize.wgsl");

const INVERT_SHADER_ID: &str = "invert";
const INVERT_SHADER_SOURCE: &str = include_str!("shaders/invert.wgsl");

const GLOW_SHADER_ID: &str = "glow";
const GLOW_SHADER_SOURCE: &str = include_str!("shaders/glow.wgsl");

const NEON_EDGE_SHADER_ID: &str = "neon-edge";
const NEON_EDGE_SHADER_SOURCE: &str = include_str!("shaders/neon_edge.wgsl");

const SHAKE_SHADER_ID: &str = "shake";
const SHAKE_SHADER_SOURCE: &str = include_str!("shaders/shake.wgsl");

const FLICKER_SHADER_ID: &str = "flicker";
const FLICKER_SHADER_SOURCE: &str = include_str!("shaders/flicker.wgsl");

pub fn shader_specs() -> [ShaderSpec; 29] {
    [
        ShaderSpec {
            id: GAUSSIAN_BLUR_SHADER_ID,
            source: GAUSSIAN_BLUR_SHADER_SOURCE,
            pack: pack_blur_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: ADJUST_SHADER_ID,
            source: ADJUST_SHADER_SOURCE,
            pack: pack_adjust_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: LUT_SHADER_ID,
            source: LUT_SHADER_SOURCE,
            pack: pack_lut_uniforms,
            lut: true,
        },
        ShaderSpec {
            id: CHROMA_KEY_SHADER_ID,
            source: CHROMA_KEY_SHADER_SOURCE,
            pack: pack_chroma_key_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: GLITCH_SHADER_ID,
            source: GLITCH_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: VHS_SHADER_ID,
            source: VHS_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: PIXELATE_SHADER_ID,
            source: PIXELATE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: CHROMATIC_ABERRATION_SHADER_ID,
            source: CHROMATIC_ABERRATION_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: RGB_SPLIT_SHADER_ID,
            source: RGB_SPLIT_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: FISHEYE_SHADER_ID,
            source: FISHEYE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: MIRROR_SHADER_ID,
            source: MIRROR_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: KALEIDOSCOPE_SHADER_ID,
            source: KALEIDOSCOPE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: ZOOM_BLUR_SHADER_ID,
            source: ZOOM_BLUR_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: RADIAL_BLUR_SHADER_ID,
            source: RADIAL_BLUR_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: SHARPEN_SHADER_ID,
            source: SHARPEN_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: TILT_SHIFT_SHADER_ID,
            source: TILT_SHIFT_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: VIGNETTE_SHADER_ID,
            source: VIGNETTE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: FILM_GRAIN_SHADER_ID,
            source: FILM_GRAIN_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: NOISE_SHADER_ID,
            source: NOISE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: HALFTONE_SHADER_ID,
            source: HALFTONE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: SCANLINES_SHADER_ID,
            source: SCANLINES_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: OLD_FILM_SHADER_ID,
            source: OLD_FILM_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: DUOTONE_SHADER_ID,
            source: DUOTONE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: POSTERIZE_SHADER_ID,
            source: POSTERIZE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: INVERT_SHADER_ID,
            source: INVERT_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: GLOW_SHADER_ID,
            source: GLOW_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: NEON_EDGE_SHADER_ID,
            source: NEON_EDGE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: SHAKE_SHADER_ID,
            source: SHAKE_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
        ShaderSpec {
            id: FLICKER_SHADER_ID,
            source: FLICKER_SHADER_SOURCE,
            pack: pack_params_uniforms,
            lut: false,
        },
    ]
}
