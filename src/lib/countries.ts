const CODES =
  "ad ae af ag ai al am ao ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo br bs bt bw by bz ca cd cf cg ch ci ck cl cm cn co cr cu cv cw cy cz de dj dk dm do dz ec ee eg er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gt gu gw gy hk hn hr ht hu id ie il im in iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mq mr ms mt mu mv mw mx my mz na nc ne ng ni nl no np nr nz om pa pe pf pg ph pk pl pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg si sk sl sm sn so sr ss st sv sx sy sz tc td tg th tj tl tm tn to tr tt tv tw tz ua ug us uy uz va vc ve vg vi vn vu ws xk ye za zm zw".split(
    " ",
  );

const names = new Intl.DisplayNames(["ru"], { type: "region" });

export const countryName = (code: string) => {
  try {
    return names.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
};

export const COUNTRIES = CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
  a.name.localeCompare(b.name, "ru"),
);
