<?php

use App\Services\Personal\PersonalCursor;

/*
 * WP-44, review of stage A, F2: each position of a personal list's cursor has its own range — a row id 1 …
 * `PHP_INT_MAX`, a time 0 … 9999-12-31 23:59:59 UTC — and a key outside it does not decode, so the list ends quietly.
 */

it('decodes the key it encoded, at both ends of every range', function (array $key, array $ranges): void {
    expect(PersonalCursor::decode(PersonalCursor::encode($key), $ranges))->toBe($key);
})->with([
    'the smallest row id' => [[1], [PersonalCursor::ROW_ID]],
    'the largest row id' => [[PHP_INT_MAX], [PersonalCursor::ROW_ID]],
    'the first second' => [[0, 1], [PersonalCursor::TIME, PersonalCursor::ROW_ID]],
    'the last second of 9999' => [[253402300799, PHP_INT_MAX], [PersonalCursor::TIME, PersonalCursor::ROW_ID]],
]);

it('refuses a position outside its range', function (array $key, array $ranges): void {
    expect(PersonalCursor::decode(PersonalCursor::encode($key), $ranges))->toBeNull();
})->with([
    'a row id of 0' => [[0], [PersonalCursor::ROW_ID]],
    'a negative row id' => [[-1], [PersonalCursor::ROW_ID]],
    'a history row id of 0' => [[1764320400, 0], [PersonalCursor::TIME, PersonalCursor::ROW_ID]],
    'a negative time' => [[-1, 1], [PersonalCursor::TIME, PersonalCursor::ROW_ID]],
    'the first second of 10000' => [[253402300800, 1], [PersonalCursor::TIME, PersonalCursor::ROW_ID]],
    'the largest integer as the time' => [[PHP_INT_MAX, 1], [PersonalCursor::TIME, PersonalCursor::ROW_ID]],
    'a key of another size' => [[5], [PersonalCursor::TIME, PersonalCursor::ROW_ID]],
]);
