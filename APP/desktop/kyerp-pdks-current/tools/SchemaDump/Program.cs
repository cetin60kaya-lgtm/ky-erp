using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

var database=new FirebirdDatabase(PdksOptions.FromEnvironment());
using var connection=database.OpenConnection();
var tables=new HashSet<string>(new[]{"KIMLIK","GRUP","BOLUM","DURUM","SERVIS","GOREV","FIRMA","ODEME","PUANTAJ","GIRCIK","DONEM"},StringComparer.OrdinalIgnoreCase);
using(var discover=new FbCommand("select trim(rdb$relation_name) from rdb$relations where coalesce(rdb$system_flag,0)=0 and (upper(rdb$relation_name) containing 'VARD' or upper(rdb$relation_name) containing 'SHIFT' or upper(rdb$relation_name) containing 'MESAI') order by rdb$relation_name",connection))
using(var reader=discover.ExecuteReader())while(reader.Read())tables.Add(reader.GetString(0));
foreach(var table in tables.OrderBy(value=>value,StringComparer.OrdinalIgnoreCase))
{
    Console.WriteLine($"=== {table} ===");
    const string sql="select trim(rf.rdb$field_name),f.rdb$field_type,rf.rdb$null_flag,rf.rdb$field_length from rdb$relation_fields rf join rdb$fields f on f.rdb$field_name=rf.rdb$field_source where rf.rdb$relation_name=@T order by rf.rdb$field_position";
    using var command=new FbCommand(sql,connection);command.Parameters.AddWithValue("@T",table.ToUpperInvariant());using var reader=command.ExecuteReader();var found=false;
    while(reader.Read()){found=true;Console.WriteLine($"{reader.GetString(0)} | type={reader.GetValue(1)} | required={reader.GetValue(2)} | length={reader.GetValue(3)}");}
    if(!found)Console.WriteLine("(tablo bulunamadı)");
}
Console.WriteLine("Şema incelemesi tamamlandı. Veri satırları güvenlik nedeniyle okunmadı.");
