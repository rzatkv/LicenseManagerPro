<?php
/**
 * License Manager Pro — site data layer (current user's licenses).
 *
 * Loads the administrator ApiClient by path: the site application
 * autoloads only the Site namespace, so the shared client is
 * required once from the administrator component directory instead
 * of being duplicated. The API key itself comes from the component
 * parameters, exactly as in the administrator.
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Site\Model;

use Joomla\CMS\Component\ComponentHelper;
use Joomla\CMS\Factory;
use Joomla\CMS\MVC\Model\BaseModel;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model\ApiClient;

class LicensesModel extends BaseModel
{
    private ?ApiClient $client = null;

    /**
     * Licenses owned by the currently logged-in user, newest first.
     * The backend search is fuzzy, so results are filtered to exact
     * owner_email matches here.
     *
     * @return array<int, array>
     */
    public function getLicenses(): array
    {
        $user = Factory::getApplication()->getIdentity();
        if ($user === null || $user->guest || $user->email === '') {
            return [];
        }
        $email = (string) $user->email;
        $licenses = $this->client()->get('/licenses?search=' . rawurlencode($email) . '&limit=100');
        $mine = array_values(array_filter(
            is_array($licenses) ? $licenses : [],
            static fn (array $license): bool => strcasecmp((string) ($license['owner_email'] ?? ''), $email) === 0
        ));
        usort($mine, static fn (array $a, array $b): int => strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
        return $mine;
    }

    private function client(): ApiClient
    {
        if ($this->client === null) {
            require_once JPATH_ADMINISTRATOR . '/components/com_licensemanagerpro/src/Model/ApiClient.php';
            $params = ComponentHelper::getParams('com_licensemanagerpro');
            $this->client = new ApiClient(
                (string) $params->get('api_url', ''),
                (string) $params->get('api_key', ''),
                (bool) $params->get('signed_requests', 0)
            );
        }
        return $this->client;
    }
}
