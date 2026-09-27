/**
 * 渡した処理を、同じインスタンス内で1つずつ順に実行する関数を作る。
 * 「重複確認→追記」が同時に走り、同じデータが2行できるのを防ぐために使う。
 * 複数インスタンスにまたがる同時実行までは防げないが、利用者が1人の現段階では十分とする。
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
