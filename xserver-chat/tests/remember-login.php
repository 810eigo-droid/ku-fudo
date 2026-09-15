<?php
const REMEMBER_LOGIN_SECONDS = 31536000;
session_start();
function check($b,$label){if(!$b){throw new Exception($label);}}
function query($sql,$args){return new class {function fetch(){return $GLOBALS['test_user'];}};}
$source = file_get_contents(__DIR__ . '/../ku-fudo-chat/bootstrap.php');
preg_match('/function loginSessionExpired\(.*?\n}/s', $source, $match);
eval($match[0]);
$from = strpos($source, 'function currentUser():');
$to = strpos($source, 'function publicUser(');
eval(substr($source, $from, $to-$from));
$from = strpos($source, 'function signIn(');
$to = strpos($source, '// Only the hash is stored.');
eval(substr($source, $from, $to-$from));
$now=time();$day=86400;
check(!loginSessionExpired([], $now),'anonymous');
check(loginSessionExpired(['signed_at'=>$now-43200,'lifetime'=>43200],$now),'unchecked expires at 12h');
check(!loginSessionExpired(['signed_at'=>$now-43199,'lifetime'=>43200],$now),'unchecked before 12h');
check(loginSessionExpired(['signed_at'=>$now-30*$day,'lifetime'=>2592000],$now),'expired legacy cannot revive');
check(!loginSessionExpired(['signed_at'=>$now-29*$day,'lifetime'=>2592000],$now),'valid legacy');
check(!loginSessionExpired(['signed_at'=>$now-900*$day,'remember'=>true,'last_seen'=>$now-$day],$now),'active retained beyond original year');
check(loginSessionExpired(['signed_at'=>$now-900*$day,'remember'=>true,'last_seen'=>$now-365*$day],$now),'one year inactivity');
$GLOBALS['test_user']=['id'=>9,'active'=>1,'version'=>3];
$_SESSION=['uid'=>9,'version'=>3,'signed_at'=>$now-29*$day,'lifetime'=>2592000];
check(currentUser()!==null,'legacy user accepted');
check($_SESSION['remember']===true && $_SESSION['lifetime']===REMEMBER_LOGIN_SECONDS,'legacy upgraded');
check($_SESSION['last_seen']>=$now && $_SESSION['cookie_renewed_at']>=$now,'renewed timestamps');
$_SESSION=['uid'=>9,'version'=>3,'signed_at'=>$now,'lifetime'=>43200,'remember'=>false];
currentUser();check($_SESSION['remember']===false && !isset($_SESSION['last_seen']),'unchecked not upgraded');
$_SESSION=['uid'=>9,'version'=>2,'signed_at'=>$now,'remember'=>true];
check(currentUser()===null && !isset($_SESSION['uid']),'password version revokes');
$GLOBALS['test_user']['active']=0;
$_SESSION=['uid'=>9,'version'=>3,'signed_at'=>$now,'remember'=>true];
check(currentUser()===null && !isset($_SESSION['uid']),'disabled revokes');
$GLOBALS['test_user']['active']=1;
signIn($GLOBALS['test_user'],true);check($_SESSION['remember']===true && $_SESSION['lifetime']===REMEMBER_LOGIN_SECONDS,'remember sign-in');
signIn($GLOBALS['test_user'],false);check($_SESSION['remember']===false && $_SESSION['lifetime']===43200,'ordinary sign-in');
echo "PASS: 15 session-policy checks\n";
