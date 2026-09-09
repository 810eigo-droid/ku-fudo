<?php
declare(strict_types=1);
require dirname(__DIR__) . '/ku-fudo-chat/policy.php';
$matrix = ['member'=>[true,false], 'candidate'=>[true,true], 'director'=>[true,true], 'admin'=>[true,true], 'unknown'=>[false,false]];
foreach ($matrix as $role=>$expected) {
    foreach (['all','board'] as $i=>$room) {
        if (roomAllowed(['role'=>$role],$room)!==$expected[$i]) { throw new RuntimeException('Policy mismatch: '.$role.'/'.$room); }
    }
    if (roomAllowed(['role'=>$role],'invalid')) { throw new RuntimeException('Unknown room accepted'); }
}
if (roomAllowed([],'all')) { throw new RuntimeException('Missing role accepted'); }
echo "PASS: 16 authorization policy cases\n";
