BEGIN { FS = "[|]" }
function reject(reason) {
    print FILENAME ":" FNR ": " reason > "/dev/stderr"
    bad = 1
    exit 2
}
{
    if (NF != 5) reject("需要五个字段")
    if ($1 !~ /^R[1-9][0-9]*$/) reject("请求编号不合约定")
    if ($2 !~ /^[1-9][0-9]*$/ || length($2) > 6) reject("版次不合约定")
    if ($3 !~ /^[a-z][a-z0-9]*$/) reject("区域键不合约定")
    if ($4 !~ /^[1-5][0-9][0-9]$/) reject("状态码不合约定")
    if ($5 !~ /^\/[[:graph:]]*$/) reject("路径不合约定")
    key = $1 SUBSEP $2
    if (key in delivery) {
        if (delivery[key] != $0) reject("同一请求同一版内容冲突 " $1 " v" $2)
        next
    }
    delivery[key] = $0
    version = $2 + 0
    if (!($1 in best) || version > best[$1]) {
        best[$1] = version
        row[$1] = $0
    }
}
END {
    if (bad) exit 2
    for (id in row) print row[id]
}
