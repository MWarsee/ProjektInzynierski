
#include <stdio.h>
#include <stdint.h>
#include <math.h>
#include <arm_neon.h> // NEON SIMD dla ARM

#include "coreslam.h"
#include "coreslam_internals.h"

/* Struktura do przechowywania wspó³rzêdnych 32-bitowych */
typedef union
{
    struct
    {
        int y;
        int x;
    } pos;

    int32x2_t neon; // NEON 2x32-bitowy wektor

} cs_pos_neon_t;

int
distance_scan_to_map(
    map_t* map,
    scan_t* scan,
    position_t position)
{
    int npoints = 0; /* liczba punktów, gdzie skan pasuje do mapy */
    int64_t sum = 0; /* suma wartoœci mapy w tych punktach */

    /* Wstêpne obliczenie sinusa i cosinusa k¹ta dla rotacji */
    double position_theta_radians = radians(position.theta_degrees);
    double costheta = cos(position_theta_radians) * map->scale_pixels_per_mm;
    double sintheta = sin(position_theta_radians) * map->scale_pixels_per_mm;

    /* Wstêpne obliczenie przesuniêcia pikseli dla translacji */
    double pos_x_pix = position.x_mm * map->scale_pixels_per_mm;
    double pos_y_pix = position.y_mm * map->scale_pixels_per_mm;

    float32x4_t sincos128 = { costheta, -sintheta, sintheta, costheta };
    float32x4_t posxy128 = { pos_x_pix, pos_y_pix, pos_x_pix, pos_y_pix };

    for (int i = 0; i < scan->npoints; i++)
    {
        /* Rozwa¿ tylko punkty skanu reprezentuj¹ce przeszkody */
        if (scan->value[i] == OBSTACLE)
        {
            /* Oblicz parê wspó³rzêdnych za pomoc¹ NEON */
            float32x4_t xy128 = { scan->x_mm[i], scan->y_mm[i], scan->x_mm[i], scan->y_mm[i] };
            xy128 = vmulq_f32(sincos128, xy128);
            xy128 = vpaddq_f32(xy128, xy128); // Dodanie par elementów
            xy128 = vaddq_f32(xy128, posxy128);

            cs_pos_neon_t pos;
            pos.neon = vcvt_s32_f32(vget_low_f32(xy128)); // Konwersja do int32

            /* Wyodrêbnij wspó³rzêdne */
            int x = pos.pos.x;
            int y = pos.pos.y;

            /* Dodaj punkt, jeœli mieœci siê w granicach mapy */
            if (x >= 0 && x < map->size_pixels && y >= 0 && y < map->size_pixels)
            {
                sum += map->pixels[y * map->size_pixels + x];
                npoints++;
            }
        }
    }

    /* Zwróæ sumê skalowan¹ przez liczbê punktów lub -1, jeœli brak */
    return npoints ? (int)(sum * 1024 / npoints) : -1;
}
