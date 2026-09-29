import { effectsRegistry } from "../registry";
import { adjustEffectDefinition } from "./adjust";
import { blurEffectDefinition } from "./blur";
import { lutEffectDefinition } from "./lut";
import { chromaKeyEffectDefinition } from "./chroma-key";
import { filterEffectDefinition } from "./filter";
import {
	chromaticAberrationEffectDefinition,
	fisheyeEffectDefinition,
	glitchEffectDefinition,
	kaleidoscopeEffectDefinition,
	mirrorEffectDefinition,
	pixelateEffectDefinition,
	rgbSplitEffectDefinition,
	vhsEffectDefinition,
} from "./distortion";
import {
	radialBlurEffectDefinition,
	sharpenEffectDefinition,
	tiltShiftEffectDefinition,
	vignetteEffectDefinition,
	zoomBlurEffectDefinition,
} from "./focus";
import {
	duotoneEffectDefinition,
	glowEffectDefinition,
	invertEffectDefinition,
	neonEdgeEffectDefinition,
	posterizeEffectDefinition,
} from "./color";
import {
	filmGrainEffectDefinition,
	halftoneEffectDefinition,
	noiseEffectDefinition,
	oldFilmEffectDefinition,
	scanlinesEffectDefinition,
} from "./texture";
import { flickerEffectDefinition, shakeEffectDefinition } from "./motion";

const defaultEffects = [
	blurEffectDefinition,
	adjustEffectDefinition,
	lutEffectDefinition,
	chromaKeyEffectDefinition,
	glitchEffectDefinition,
	vhsEffectDefinition,
	pixelateEffectDefinition,
	chromaticAberrationEffectDefinition,
	rgbSplitEffectDefinition,
	fisheyeEffectDefinition,
	mirrorEffectDefinition,
	kaleidoscopeEffectDefinition,
	zoomBlurEffectDefinition,
	radialBlurEffectDefinition,
	sharpenEffectDefinition,
	tiltShiftEffectDefinition,
	vignetteEffectDefinition,
	filmGrainEffectDefinition,
	noiseEffectDefinition,
	halftoneEffectDefinition,
	scanlinesEffectDefinition,
	oldFilmEffectDefinition,
	duotoneEffectDefinition,
	posterizeEffectDefinition,
	invertEffectDefinition,
	glowEffectDefinition,
	neonEdgeEffectDefinition,
	shakeEffectDefinition,
	flickerEffectDefinition,
	filterEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
