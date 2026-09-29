import type { ParamDefinition, ParamValues } from "@/params";

export interface Effect {
	id: string;
	type: string;
	params: ParamValues;
	enabled: boolean;
}

export type EffectUniformValue = number | number[];

export interface EffectLutData {
	size: number;
	data: number[];
	domainMin: number;
	domainMax: number;
}

export interface EffectPass {
	shader: string;
	uniforms: Record<string, EffectUniformValue>;
	lut?: EffectLutData;
}

export interface EffectPassTemplate {
	shader: string;
	uniforms(params: {
		effectParams: ParamValues;
		width: number;
		height: number;
		time: number;
	}): Record<string, EffectUniformValue>;
}

export interface EffectRendererConfig {
	passes: EffectPassTemplate[];
	buildPasses?: (params: {
		effectParams: ParamValues;
		width: number;
		height: number;
		time: number;
	}) => EffectPass[];
}

export interface EffectDefinition {
	type: string;
	name: string;
	keywords: string[];
	params: ParamDefinition[];
	renderer: EffectRendererConfig;
	/** Hide from the generic Assets → Effects grid; presented by a dedicated surface instead. */
	hidden?: boolean;
}
