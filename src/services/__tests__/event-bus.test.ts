import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../event-bus';

describe('EventBus Service', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clear();
  });

  it('should register and fire an event', () => {
    const handler = vi.fn();
    eventBus.on('file_saved', handler);

    eventBus.fire('file_saved', { path: 'test.ts' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ path: 'test.ts' });
  });

  it('should support multiple handlers for the same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    eventBus.on('file_saved', handler1);
    eventBus.on('file_saved', handler2);

    eventBus.fire('file_saved', 'data');

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith('data');
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith('data');
  });

  it('should support removing a handler via disposal', () => {
    const handler = vi.fn();
    const disposable = eventBus.on('file_saved', handler);

    disposable.dispose();
    eventBus.fire('file_saved', 'data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle errors in handlers without throwing', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badHandler = vi.fn().mockImplementation(() => {
      throw new Error('Handler crashed');
    });
    const goodHandler = vi.fn();

    eventBus.on('file_saved', badHandler);
    eventBus.on('file_saved', goodHandler);

    expect(() => eventBus.fire('file_saved', 'data')).not.toThrow();
    expect(badHandler).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should support async handlers and log failed promises', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // We want to verify that the async handler is invoked
    let resolved = false;
    let rejected = false;

    const asyncGoodHandler = async () => {
      resolved = true;
    };

    const asyncBadHandler = async () => {
      rejected = true;
      throw new Error('Async handler failed');
    };

    eventBus.on('file_modified', asyncGoodHandler);
    eventBus.on('file_modified', asyncBadHandler);

    eventBus.fire('file_modified', 'data');

    // Wait for microtasks
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(resolved).toBe(true);
    expect(rejected).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should clear all handlers', () => {
    const handler = vi.fn();
    eventBus.on('file_saved', handler);
    eventBus.clear();

    eventBus.fire('file_saved', 'data');
    expect(handler).not.toHaveBeenCalled();
  });
});
