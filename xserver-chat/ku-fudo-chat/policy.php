<?php
declare(strict_types=1);

// Fail closed for unknown rooms/roles. Used by every room read and write endpoint.
function roomAllowed(array $user, string $room): bool {
    $role = $user['role'] ?? '';
    if ($role !== 'admin' && (int)($user['chat_access'] ?? 1)!==1) { return false; }
    if (!in_array($role, ['member','candidate','director','admin'], true)) { return false; }
    return $room === 'all' || ($room === 'board' && in_array($role, ['director','candidate','admin'], true));
}

