BEGIN { FS = "[|]"; OFS = "|" }
function reject(reason) {
    print FILENAME ":" FNR ": " reason > "/dev/stderr"
    bad = 1
    exit 2
}
FILENAME == ARGV[1] {
    if (NF != 2 || $1 !~ /^[a-z][a-z0-9]*$/ || $2 == "") reject("区域表格式错误")
    if ($0 ~ /[[:cntrl:]]/) reject("区域表含控制字符")
    if ($1 in label) reject("区域重复 " $1)
    label[$1] = $2
    next
}
{
    if (!($3 in label)) reject("区域未登记 " $3 " " $1)
    total[$3]++
    if ($4 + 0 >= 400) errors[$3]++
}
END {
    if (bad) exit 2
    for (region in label) print region, label[region], total[region]+0, errors[region]+0
}
