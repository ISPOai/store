use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct EffectPass {
    pub shader: String,
    pub uniforms: HashMap<String, UniformValue>,
    /// Auxiliary 3D LUT data for shaders that declare a LUT texture binding.
    pub lut: Option<LutData>,
}

#[derive(Clone, Debug)]
pub enum UniformValue {
    Number(f32),
    Vector(Vec<f32>),
}

/// A parsed 3D `.cube` LUT ready for upload as a 3D texture. `data` holds
/// `size * size * size` RGB triplets (length `size^3 * 3`) with each channel
/// normalized to `0..1`.
#[derive(Clone, Debug)]
pub struct LutData {
    pub size: u32,
    pub data: Vec<f32>,
    pub domain_min: f32,
    pub domain_max: f32,
}
