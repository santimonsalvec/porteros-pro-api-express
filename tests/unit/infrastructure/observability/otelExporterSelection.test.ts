import { describe, expect, it } from 'vitest';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { createSpanExporter } from '../../../../src/infrastructure/observability/otel.js';

describe('createSpanExporter', () => {
  it('selects the OTLP exporter when an endpoint is configured', () => {
    const exporter = createSpanExporter('http://collector:4318/v1/traces');
    expect(exporter).toBeInstanceOf(OTLPTraceExporter);
  });

  it('falls back to the console exporter when no endpoint is configured', () => {
    const exporter = createSpanExporter(undefined);
    expect(exporter).toBeInstanceOf(ConsoleSpanExporter);
  });
});
