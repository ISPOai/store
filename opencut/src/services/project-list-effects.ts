import { effectsRegistry } from "@/effects";
import type { EffectDefinition } from "@/effects/types";
import type { ParamDefinition } from "@/params";

interface EffectParamSchema {
	key: string;
	label: string;
	type: string;
	default?: number | string | boolean;
	min?: number;
	max?: number;
	step?: number;
	options?: Array<{ value: string; label: string }>;
}

function describeParam(param: ParamDefinition): EffectParamSchema {
	const base: EffectParamSchema = {
		key: param.key,
		label: param.label,
		type: param.type,
	};

	if (param.type === "number") {
		return {
			...base,
			default: param.default,
			min: param.min,
			max: param.max,
			step: param.step,
		};
	}
	if (param.type === "select") {
		return { ...base, default: param.default, options: param.options };
	}
	return { ...base, default: param.default };
}

function describeDefinition(definition: EffectDefinition) {
	return {
		type: definition.type,
		name: definition.name,
		keywords: definition.keywords,
		params: definition.params.map(describeParam),
	};
}

export async function listEffects() {
	const effects = effectsRegistry.getAll().map(describeDefinition);
	return {
		kind: "json" as const,
		data: { effects },
	};
}
