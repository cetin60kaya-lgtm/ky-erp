namespace KYERP.PDKS.Core.Personnel;

public static class PersonnelListFilter
{
    public static string Build(string? search)
    {
        var value=(search??string.Empty).Trim().Replace("'","''");
        if(value.Length==0)return string.Empty;
        return $"PKNO LIKE '%{value}%' OR AD LIKE '%{value}%' OR SOYAD LIKE '%{value}%' OR " +
               $"CONVERT(IGTARIH, 'System.String') LIKE '%{value}%' OR CONVERT(ICTARIH, 'System.String') LIKE '%{value}%'";
    }
}
