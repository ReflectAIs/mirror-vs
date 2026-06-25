import { ContextItem } from './types';

export class ContextStore {
  private _items = new Map<string, ContextItem>();
  private _recencyCounter = 0;

  public get items(): ContextItem[] {
    return Array.from(this._items.values());
  }

  public addItem(
    key: string,
    value: any,
    role: 'system' | 'user' | 'assistant' | 'tool',
    priority: number = 1,
    dependencyCount: number = 0,
    pinStatus: boolean = false,
    customRecency?: number,
  ): void {
    this._recencyCounter++;
    this._items.set(key, {
      key,
      value,
      role,
      priority,
      recency: customRecency !== undefined ? customRecency : this._recencyCounter,
      dependencyCount,
      pinStatus,
    });
  }

  public getItem(key: string): ContextItem | undefined {
    const item = this._items.get(key);
    if (item) {
      this._recencyCounter++;
      item.recency = this._recencyCounter; // Update recency on access
    }
    return item;
  }

  public deleteItem(key: string): boolean {
    return this._items.delete(key);
  }

  public clear(): void {
    this._items.clear();
    this._recencyCounter = 0;
  }

  public calculateScore(item: ContextItem): number {
    if (item.pinStatus) {
      return Infinity;
    }
    if (item.key.startsWith('file:')) {
      return item.priority + (item.recency * 0.1) + (item.dependencyCount * 0.5);
    }
    // Weights: Priority weight = 20, Recency weight = 2, DependencyCount weight = 5
    const priorityScore = item.priority * 20;
    const recencyScore = item.recency * 2;
    const dependencyScore = item.dependencyCount * 5;
    return priorityScore + recencyScore + dependencyScore;
  }

  /**
   * Evict items when capacity is exceeded until we are within the budget.
   * Returns list of keys evicted.
   */
  public evictToBudget(maxBudget: number, costCalculator: (item: ContextItem) => number): string[] {
    const evictedKeys: string[] = [];
    
    while (true) {
      let currentTotalCost = 0;
      const sortedItems: ContextItem[] = [];
      
      for (const item of this._items.values()) {
        currentTotalCost += costCalculator(item);
        sortedItems.push(item);
      }

      if (currentTotalCost <= maxBudget || sortedItems.length === 0) {
        break;
      }

      // Sort by score ascending so the lowest score is at index 0 (least valuable)
      sortedItems.sort((a, b) => this.calculateScore(a) - this.calculateScore(b));

      const candidate = sortedItems[0];
      if (candidate.pinStatus || this.calculateScore(candidate) === Infinity) {
        // Can't evict anymore
        break;
      }

      this._items.delete(candidate.key);
      evictedKeys.push(candidate.key);
    }

    return evictedKeys;
  }
}
